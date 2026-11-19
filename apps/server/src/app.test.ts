import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Account, ApiError, AuthResponse } from '@repo/contracts';
import { buildApp } from './app';
import { SESSION_COOKIE_NAME } from './session';

const ADMIN_PASSWORD = 'admin-password-123';
const VIEWER_PASSWORD = 'viewer-password-1';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let app: FastifyInstance;
let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'ffm-server-'));
  app = await buildApp({
    dataDir,
    adminPassword: ADMIN_PASSWORD,
    adminUsername: 'admin',
    logger: false,
  });
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

function cookieHeader(sessionId: string): { cookie: string } {
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

function readSessionId(response: InjectResponse): string {
  const cookie = response.cookies.find((item) => item.name === SESSION_COOKIE_NAME);
  expect(cookie).toBeDefined();
  return cookie?.value ?? '';
}

async function login(username: string, password: string): Promise<InjectResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
}

async function loginAsAdmin(): Promise<string> {
  const response = await login('admin', ADMIN_PASSWORD);
  expect(response.statusCode).toBe(200);
  return readSessionId(response);
}

async function createViewer(
  adminSessionId: string,
  username = 'viewer1',
  password = VIEWER_PASSWORD,
): Promise<Account> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    headers: cookieHeader(adminSessionId),
    payload: { username, password },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Account>();
}

async function listAccounts(sessionId: string): Promise<Account[]> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/accounts',
    headers: cookieHeader(sessionId),
  });
  expect(response.statusCode).toBe(200);
  return response.json<Account[]>();
}

describe('基础接口与认证', () => {
  it('健康检查返回 ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('ok');
  });

  it('管理员登录成功并下发 HttpOnly 会话 Cookie', async () => {
    const response = await login('admin', ADMIN_PASSWORD);
    expect(response.statusCode).toBe(200);

    const body = response.json<AuthResponse>();
    expect(body.user.username).toBe('admin');
    expect(body.user.role).toBe('admin');
    expect(body.user).not.toHaveProperty('passwordHash');

    const setCookie = response.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(rawCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(rawCookie).toContain('HttpOnly');
    expect(rawCookie).toContain('SameSite=Lax');
  });

  it('密码错误与用户名不存在返回相同的 401 信息且不下发会话', async () => {
    const wrongPassword = await login('admin', 'wrong-password');
    const unknownUser = await login('nobody', 'whatever-password');

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    const firstError = wrongPassword.json<ApiError>();
    const secondError = unknownUser.json<ApiError>();
    expect(firstError.code).toBe('UNAUTHORIZED');
    expect(firstError.message).toBe(secondError.message);
    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('未登录访问账号列表返回 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/accounts' });
    expect(response.statusCode).toBe(401);
    expect(response.json<ApiError>().code).toBe('UNAUTHORIZED');
  });

  it('登录后可获取包含 admin 的账号列表', async () => {
    const adminSession = await loginAsAdmin();
    const accounts = await listAccounts(adminSession);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toBe('admin');
    expect(accounts[0]?.role).toBe('admin');
  });

  it('注销后原会话失效', async () => {
    const adminSession = await loginAsAdmin();
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: cookieHeader(adminSession),
    });
    expect(logout.statusCode).toBe(204);

    const accounts = await app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: cookieHeader(adminSession),
    });
    expect(accounts.statusCode).toBe(401);
  });
});

describe('账号管理', () => {
  it('管理员创建 viewer 账号后列表可见', async () => {
    const adminSession = await loginAsAdmin();
    const created = await createViewer(adminSession, 'new-viewer');

    expect(created.role).toBe('viewer');
    expect(created.username).toBe('new-viewer');
    expect(created).not.toHaveProperty('passwordHash');

    const accounts = await listAccounts(adminSession);
    expect(accounts.map((account) => account.username)).toEqual(['admin', 'new-viewer']);
  });

  it('重复用户名（忽略大小写，包括 admin）返回 409', async () => {
    const adminSession = await loginAsAdmin();
    await createViewer(adminSession, 'viewer1');

    const duplicated = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: cookieHeader(adminSession),
      payload: { username: 'Viewer1', password: VIEWER_PASSWORD },
    });
    expect(duplicated.statusCode).toBe(409);
    expect(duplicated.json<ApiError>().code).toBe('CONFLICT');

    const adminDuplicated = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: cookieHeader(adminSession),
      payload: { username: 'admin', password: VIEWER_PASSWORD },
    });
    expect(adminDuplicated.statusCode).toBe(409);

    const accounts = await listAccounts(adminSession);
    expect(accounts).toHaveLength(2);
  });

  it('创建时指定 role: admin 返回 400 且不创建账号', async () => {
    const adminSession = await loginAsAdmin();
    const response = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: cookieHeader(adminSession),
      payload: { username: 'another-admin', password: VIEWER_PASSWORD, role: 'admin' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().code).toBe('VALIDATION_ERROR');

    const accounts = await listAccounts(adminSession);
    expect(accounts).toHaveLength(1);
  });

  it('viewer 创建与删除账号返回 403 且数据不变', async () => {
    const adminSession = await loginAsAdmin();
    const viewer = await createViewer(adminSession, 'readonly-user');

    const viewerLogin = await login('readonly-user', VIEWER_PASSWORD);
    expect(viewerLogin.statusCode).toBe(200);
    const viewerSession = readSessionId(viewerLogin);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      headers: cookieHeader(viewerSession),
      payload: { username: 'forbidden-user', password: VIEWER_PASSWORD },
    });
    expect(createResponse.statusCode).toBe(403);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/accounts/${viewer.id}`,
      headers: cookieHeader(viewerSession),
    });
    expect(deleteResponse.statusCode).toBe(403);

    const accounts = await listAccounts(adminSession);
    expect(accounts).toHaveLength(2);
  });

  it('修改用户名后可用新用户名登录且旧密码仍有效', async () => {
    const adminSession = await loginAsAdmin();
    const viewer = await createViewer(adminSession, 'old-name');

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/accounts/${viewer.id}`,
      headers: cookieHeader(adminSession),
      payload: { username: 'new-name' },
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json<Account>().username).toBe('new-name');

    const oldNameLogin = await login('old-name', VIEWER_PASSWORD);
    expect(oldNameLogin.statusCode).toBe(401);

    const newNameLogin = await login('new-name', VIEWER_PASSWORD);
    expect(newNameLogin.statusCode).toBe(200);
  });

  it('修改密码后新密码可登录、旧密码 401', async () => {
    const adminSession = await loginAsAdmin();
    const viewer = await createViewer(adminSession, 'reset-user');

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/accounts/${viewer.id}`,
      headers: cookieHeader(adminSession),
      payload: { password: 'brand-new-password' },
    });
    expect(patchResponse.statusCode).toBe(200);

    const oldPasswordLogin = await login('reset-user', VIEWER_PASSWORD);
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await login('reset-user', 'brand-new-password');
    expect(newPasswordLogin.statusCode).toBe(200);
  });

  it('修改或删除内置管理员返回 403', async () => {
    const adminSession = await loginAsAdmin();

    const patchAdmin = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/admin',
      headers: cookieHeader(adminSession),
      payload: { password: 'another-password' },
    });
    expect(patchAdmin.statusCode).toBe(403);

    const deleteAdmin = await app.inject({
      method: 'DELETE',
      url: '/api/accounts/admin',
      headers: cookieHeader(adminSession),
    });
    expect(deleteAdmin.statusCode).toBe(403);

    const loginWithOldPassword = await login('admin', ADMIN_PASSWORD);
    expect(loginWithOldPassword.statusCode).toBe(200);
  });

  it('删除 viewer 后无法登录且已有会话失效', async () => {
    const adminSession = await loginAsAdmin();
    const viewer = await createViewer(adminSession, 'temporary-user');

    const viewerLogin = await login('temporary-user', VIEWER_PASSWORD);
    expect(viewerLogin.statusCode).toBe(200);
    const viewerSession = readSessionId(viewerLogin);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/accounts/${viewer.id}`,
      headers: cookieHeader(adminSession),
    });
    expect(deleteResponse.statusCode).toBe(204);

    const loginAfterDelete = await login('temporary-user', VIEWER_PASSWORD);
    expect(loginAfterDelete.statusCode).toBe(401);

    const sessionAfterDelete = await app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: cookieHeader(viewerSession),
    });
    expect(sessionAfterDelete.statusCode).toBe(401);
  });

  it('修改或删除不存在的账号返回 404', async () => {
    const adminSession = await loginAsAdmin();

    const patchMissing = await app.inject({
      method: 'PATCH',
      url: '/api/accounts/not-exist',
      headers: cookieHeader(adminSession),
      payload: { password: 'whatever-password' },
    });
    expect(patchMissing.statusCode).toBe(404);

    const deleteMissing = await app.inject({
      method: 'DELETE',
      url: '/api/accounts/not-exist',
      headers: cookieHeader(adminSession),
    });
    expect(deleteMissing.statusCode).toBe(404);
  });
});

describe('持久化与敏感信息', () => {
  it('使用同一数据目录的新实例仍可读取账号并登录', async () => {
    const adminSession = await loginAsAdmin();
    await createViewer(adminSession, 'persisted-user');

    const secondApp = await buildApp({
      dataDir,
      adminPassword: ADMIN_PASSWORD,
      adminUsername: 'admin',
      logger: false,
    });
    try {
      const response = await secondApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'persisted-user', password: VIEWER_PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<AuthResponse>().user.username).toBe('persisted-user');
    } finally {
      await secondApp.close();
    }
  });

  it('账号文件不含明文密码且 passwordHash 形如 salt:hash', async () => {
    const adminSession = await loginAsAdmin();
    await createViewer(adminSession, 'disk-user');

    const raw = await readFile(join(dataDir, 'accounts.json'), 'utf8');
    expect(raw).not.toContain(VIEWER_PASSWORD);
    expect(raw).not.toContain(ADMIN_PASSWORD);

    const stored = JSON.parse(raw) as Array<{ username: string; passwordHash: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.username).toBe('disk-user');
    expect(stored[0]?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
});
