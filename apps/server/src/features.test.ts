import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Account, ApiError, FeatureItem } from '@repo/contracts';
import { buildApp } from './app';
import { SESSION_COOKIE_NAME } from './session';

const ADMIN_PASSWORD = 'admin-password-123';
const VIEWER_PASSWORD = 'viewer-password-1';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let app: FastifyInstance;
let dataDir: string;
let adminSessionId: string;
let viewerSessionId: string;

function cookieHeader(sessionId: string): { cookie: string } {
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

function readSessionId(response: InjectResponse): string {
  const cookie = response.cookies.find((item) => item.name === SESSION_COOKIE_NAME);
  expect(cookie).toBeDefined();
  return cookie?.value ?? '';
}

async function login(instance: FastifyInstance, username: string, password: string) {
  return instance.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
}

async function createFeature(
  sessionId: string,
  payload: Record<string, unknown> = {},
): Promise<FeatureItem> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/features',
    headers: cookieHeader(sessionId),
    payload: {
      name: '销售看板',
      description: '基于 ECharts 的销售数据看板',
      kind: 'echarts',
      url: 'https://example.com/dashboard',
      ...payload,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<FeatureItem>();
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'ffm-features-'));
  app = await buildApp({
    dataDir,
    adminPassword: ADMIN_PASSWORD,
    adminUsername: 'admin',
    logger: false,
  });

  const adminLogin = await login(app, 'admin', ADMIN_PASSWORD);
  expect(adminLogin.statusCode).toBe(200);
  adminSessionId = readSessionId(adminLogin);

  const created = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    headers: cookieHeader(adminSessionId),
    payload: { username: 'viewer1', password: VIEWER_PASSWORD },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json<Account>().role).toBe('viewer');

  const viewerLogin = await login(app, 'viewer1', VIEWER_PASSWORD);
  expect(viewerLogin.statusCode).toBe(200);
  viewerSessionId = readSessionId(viewerLogin);
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe('功能列表', () => {
  it('未登录访问功能列表返回 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/features' });
    expect(response.statusCode).toBe(401);
    expect(response.json<ApiError>().code).toBe('UNAUTHORIZED');
  });

  it('管理员创建功能后所有登录用户可见，viewer 不能写入', async () => {
    const feature = await createFeature(adminSessionId);
    expect(feature.name).toBe('销售看板');
    expect(feature.kind).toBe('echarts');

    const viewerList = await app.inject({
      method: 'GET',
      url: '/api/features',
      headers: cookieHeader(viewerSessionId),
    });
    expect(viewerList.statusCode).toBe(200);
    expect(viewerList.json<FeatureItem[]>()).toHaveLength(1);

    const viewerCreate = await app.inject({
      method: 'POST',
      url: '/api/features',
      headers: cookieHeader(viewerSessionId),
      payload: { name: '越权创建', kind: 'html', url: 'https://example.com' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    const viewerDelete = await app.inject({
      method: 'DELETE',
      url: `/api/features/${feature.id}`,
      headers: cookieHeader(viewerSessionId),
    });
    expect(viewerDelete.statusCode).toBe(403);
  });

  it('创建时校验名称、类型与地址', async () => {
    const blankName = await app.inject({
      method: 'POST',
      url: '/api/features',
      headers: cookieHeader(adminSessionId),
      payload: { name: '   ', kind: 'html', url: 'https://example.com' },
    });
    expect(blankName.statusCode).toBe(400);

    const badKind = await app.inject({
      method: 'POST',
      url: '/api/features',
      headers: cookieHeader(adminSessionId),
      payload: { name: '功能', kind: 'java', url: 'https://example.com' },
    });
    expect(badKind.statusCode).toBe(400);

    const badUrl = await app.inject({
      method: 'POST',
      url: '/api/features',
      headers: cookieHeader(adminSessionId),
      payload: { name: '功能', kind: 'html', url: 'javascript:alert(1)' },
    });
    expect(badUrl.statusCode).toBe(400);

    const list = await app.inject({
      method: 'GET',
      url: '/api/features',
      headers: cookieHeader(adminSessionId),
    });
    expect(list.json<FeatureItem[]>()).toHaveLength(0);
  });

  it('管理员可以编辑与删除功能', async () => {
    const feature = await createFeature(adminSessionId);

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/features/${feature.id}`,
      headers: cookieHeader(adminSessionId),
      payload: { name: '销售看板 v2', url: '/apps/sales' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json<FeatureItem>()).toMatchObject({
      name: '销售看板 v2',
      url: '/apps/sales',
      kind: 'echarts',
    });

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/features/${feature.id}`,
      headers: cookieHeader(adminSessionId),
    });
    expect(remove.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/api/features',
      headers: cookieHeader(adminSessionId),
    });
    expect(list.json<FeatureItem[]>()).toHaveLength(0);

    const missing = await app.inject({
      method: 'PATCH',
      url: `/api/features/${feature.id}`,
      headers: cookieHeader(adminSessionId),
      payload: { name: '不存在' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('功能数据在服务重启后仍可读取', async () => {
    await createFeature(adminSessionId);

    const restarted = await buildApp({
      dataDir,
      adminPassword: ADMIN_PASSWORD,
      adminUsername: 'admin',
      logger: false,
    });

    try {
      const loginResponse = await login(restarted, 'admin', ADMIN_PASSWORD);
      const sessionId = readSessionId(loginResponse);

      const list = await restarted.inject({
        method: 'GET',
        url: '/api/features',
        headers: cookieHeader(sessionId),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json<FeatureItem[]>()).toHaveLength(1);
    } finally {
      await restarted.close();
    }
  });
});
