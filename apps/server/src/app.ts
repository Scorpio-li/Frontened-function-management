import { createHash, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ADMIN_USERNAME, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from '@repo/contracts';
import type { Account, ApiError, ApiErrorCode, AuthResponse, CurrentUser } from '@repo/contracts';
import { hashPassword, verifyPassword } from './password';
import { SESSION_COOKIE_NAME, SessionStore } from './session';
import { AccountStore, DuplicateUsernameError, normalizeUsername } from './store';
import type { StoredAccount } from './store';
import { readSmtpConfig, sendMail, verifySmtpConnection } from './mailer';

/** 内置管理员固定 id。 */
const ADMIN_ID = 'admin';
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_FAILED_MESSAGE = '用户名或密码错误';
const UNAUTHORIZED_MESSAGE = '未登录或登录已过期';
const FORBIDDEN_MESSAGE = '当前账号无权限执行该操作';

export interface BuildAppOptions {
  dataDir: string;
  adminPassword: string;
  adminUsername?: string;
  sessionTtlMs?: number;
  logger?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 常量时间字符串比较，避免登录时泄露密码长度等信息。 */
function safeEqualStrings(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function toPublicAccount(stored: StoredAccount): Account {
  return {
    id: stored.id,
    username: stored.username,
    role: stored.role,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
): FastifyReply {
  const payload: ApiError = { code, message };
  return reply.code(statusCode).send(payload);
}

function readSessionId(request: FastifyRequest): string | undefined {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  return sessionId ? sessionId : undefined;
}

function sessionCookieOptions(ttlMs: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: Math.max(1, Math.floor(ttlMs / 1000)),
  };
}

/** 构建 Fastify 应用，便于测试注入；监听由调用方负责。 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  if (options.adminPassword.trim() === '') {
    throw new Error(
      '缺少 FFM_ADMIN_PASSWORD 环境变量，请在 apps/server/.env.local 中配置本地管理员密码',
    );
  }

  const app = Fastify({ logger: options.logger ?? false });
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const adminUsername = normalizeUsername(options.adminUsername ?? ADMIN_USERNAME);
  const adminCreatedAt = new Date().toISOString();
  const adminAccount: CurrentUser = {
    id: ADMIN_ID,
    username: adminUsername,
    role: 'admin',
    createdAt: adminCreatedAt,
    updatedAt: adminCreatedAt,
  };

  await app.register(cookie);

  const store = new AccountStore(options.dataDir);
  await store.init();
  const sessions = new SessionStore(sessionTtlMs);

  function resolveCurrentUser(request: FastifyRequest): CurrentUser | null {
    const sessionId = readSessionId(request);
    if (!sessionId) return null;

    const session = sessions.get(sessionId);
    if (!session) return null;

    if (session.accountId === ADMIN_ID) {
      return { ...adminAccount };
    }

    const stored = store.findById(session.accountId);
    if (!stored) {
      // 账号已删除时立即销毁其遗留会话。
      sessions.destroy(sessionId);
      return null;
    }
    return toPublicAccount(stored);
  }

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post('/api/auth/login', async (request, reply) => {
    const body: unknown = request.body;
    if (!isRecord(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请提供用户名和密码');
    }

    const username = normalizeUsername(body.username);
    const password = body.password;
    if (username === '' || password === '') {
      return sendError(reply, 400, 'VALIDATION_ERROR', '用户名和密码不能为空');
    }

    let user: CurrentUser | null = null;
    if (username === adminAccount.username) {
      if (safeEqualStrings(password, options.adminPassword)) {
        user = { ...adminAccount };
      }
    } else {
      const stored = store.findByUsername(username);
      if (stored && (await verifyPassword(password, stored.passwordHash))) {
        user = toPublicAccount(stored);
      }
    }

    // 用户名不存在与密码错误统一返回相同信息，避免账号枚举。
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', LOGIN_FAILED_MESSAGE);
    }

    const sessionId = sessions.create(user.id);
    reply.setCookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions(sessionTtlMs));
    const payload: AuthResponse = { user };
    return reply.code(200).send(payload);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = readSessionId(request);
    if (sessionId) {
      sessions.destroy(sessionId);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    const payload: AuthResponse = { user };
    return reply.send(payload);
  });

  app.get('/api/accounts', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    const viewers = store
      .list()
      .map(toPublicAccount)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return [{ ...adminAccount }, ...viewers];
  });

  app.post('/api/accounts', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    if (user.role !== 'admin') {
      return sendError(reply, 403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }

    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请求参数格式不正确');
    }
    if ('role' in body && body.role !== 'viewer') {
      return sendError(reply, 400, 'VALIDATION_ERROR', '新账号角色只能是 viewer');
    }

    const username = typeof body.username === 'string' ? normalizeUsername(body.username) : '';
    if (!USERNAME_PATTERN.test(username)) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        '用户名需为 3–32 位小写字母、数字、下划线或连字符',
      );
    }
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < PASSWORD_MIN_LENGTH) {
      return sendError(reply, 400, 'VALIDATION_ERROR', `密码长度至少为 ${PASSWORD_MIN_LENGTH} 位`);
    }
    if (username === adminAccount.username || store.findByUsername(username)) {
      return sendError(reply, 409, 'CONFLICT', '用户名已存在');
    }

    const passwordHash = await hashPassword(password);
    try {
      const created = await store.create({ username, passwordHash });
      const payload: Account = toPublicAccount(created);
      return reply.code(201).send(payload);
    } catch (error) {
      if (error instanceof DuplicateUsernameError) {
        return sendError(reply, 409, 'CONFLICT', '用户名已存在');
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>('/api/accounts/:id', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    if (user.role !== 'admin') {
      return sendError(reply, 403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }

    const { id } = request.params;
    if (id === ADMIN_ID) {
      return sendError(reply, 403, 'FORBIDDEN', '内置管理员不可修改');
    }

    const existing = store.findById(id);
    if (!existing) {
      return sendError(reply, 404, 'NOT_FOUND', '账号不存在');
    }

    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请求参数格式不正确');
    }
    if ('role' in body) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '不允许修改账号角色');
    }

    const hasUsername = 'username' in body && body.username !== undefined;
    const hasPassword = 'password' in body && body.password !== undefined;
    if (!hasUsername && !hasPassword) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请至少提供用户名或密码');
    }

    let username: string | undefined;
    if (hasUsername) {
      if (typeof body.username !== 'string') {
        return sendError(reply, 400, 'VALIDATION_ERROR', '用户名格式不正确');
      }
      username = normalizeUsername(body.username);
      if (!USERNAME_PATTERN.test(username)) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          '用户名需为 3–32 位小写字母、数字、下划线或连字符',
        );
      }
      const conflict = store.findByUsername(username);
      if (username === adminAccount.username || (conflict && conflict.id !== id)) {
        return sendError(reply, 409, 'CONFLICT', '用户名已存在');
      }
    }

    let passwordHash: string | undefined;
    if (hasPassword) {
      if (typeof body.password !== 'string' || body.password.length < PASSWORD_MIN_LENGTH) {
        return sendError(
          reply,
          400,
          'VALIDATION_ERROR',
          `密码长度至少为 ${PASSWORD_MIN_LENGTH} 位`,
        );
      }
      passwordHash = await hashPassword(body.password);
    }

    try {
      const updated = await store.update(id, { username, passwordHash });
      if (!updated) {
        return sendError(reply, 404, 'NOT_FOUND', '账号不存在');
      }
      const payload: Account = toPublicAccount(updated);
      return reply.send(payload);
    } catch (error) {
      if (error instanceof DuplicateUsernameError) {
        return sendError(reply, 409, 'CONFLICT', '用户名已存在');
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    if (user.role !== 'admin') {
      return sendError(reply, 403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }

    const { id } = request.params;
    if (id === ADMIN_ID) {
      return sendError(reply, 403, 'FORBIDDEN', '内置管理员不可删除');
    }

    const removed = await store.remove(id);
    if (!removed) {
      return sendError(reply, 404, 'NOT_FOUND', '账号不存在');
    }
    // 删除账号后让其所有会话立即失效。
    sessions.destroyByAccount(id);
    return reply.code(204).send();
  });

  /** 邮件发送接口。需要登录态 + 已配置 SMTP。 */
  app.post('/api/mail/send', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }

    if (!readSmtpConfig()) {
      return sendError(
        reply,
        503,
        'INTERNAL_ERROR',
        'SMTP 未配置，请在 apps/server/.env.local 中设置 SMTP_HOST / SMTP_USER / SMTP_PASS',
      );
    }

    const body: unknown = request.body;
    if (!isRecord(body)) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请求参数格式不正确');
    }

    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.text === 'string' ? body.text : undefined;
    const html = typeof body.html === 'string' ? body.html : undefined;

    if (!to) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '收件人地址不能为空');
    }
    if (!subject) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '邮件主题不能为空');
    }
    if (!text && !html) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        '邮件正文不能为空（text 或 html 至少提供一个）',
      );
    }

    try {
      const result = await sendMail({ to, subject, text, html });
      return reply.send({ message: '邮件发送成功', messageId: result.messageId });
    } catch (error) {
      const message = error instanceof Error ? error.message : '邮件发送失败';
      return sendError(reply, 502, 'INTERNAL_ERROR', message);
    }
  });

  app.get('/api/mail/configured', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    return { configured: readSmtpConfig() !== null };
  });

  /** 测试 SMTP 连接（验证用户名密码是否正确、端口是否可达）。 */
  app.post('/api/mail/verify', async (request, reply) => {
    const user = resolveCurrentUser(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }

    const result = await verifySmtpConnection();
    if (result.ok) {
      return reply.send({ ok: true, message: 'SMTP 连接成功' });
    }
    return reply.code(200).send({ ok: false, message: result.message });
  });

  app.setNotFoundHandler((request, reply) => {
    request.log.debug({ url: request.url }, '未匹配到路由');
    return sendError(reply, 404, 'NOT_FOUND', '接口不存在');
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.statusCode === 400) {
      return sendError(reply, 400, 'VALIDATION_ERROR', '请求参数格式不正确');
    }
    request.log.error(error);
    return sendError(reply, 500, 'INTERNAL_ERROR', '服务器内部错误');
  });

  return app;
}
