import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import type { CssEffect, EffectCategory } from './effect-store';
import { SESSION_COOKIE_NAME } from './session';

const ADMIN_PASSWORD = 'admin-password-123';
const VIEWER_PASSWORD = 'viewer-password-1';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let app: FastifyInstance;
let dataDir: string;
let adminHeaders: { cookie: string };
let viewerHeaders: { cookie: string };

function readSessionId(response: InjectResponse): string {
  const cookie = response.cookies.find((item) => item.name === SESSION_COOKIE_NAME);
  expect(cookie).toBeDefined();
  return cookie?.value ?? '';
}

async function login(username: string, password: string): Promise<InjectResponse> {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'ffm-css-effects-'));
  app = await buildApp({
    dataDir,
    adminPassword: ADMIN_PASSWORD,
    adminUsername: 'admin',
    logger: false,
  });

  const adminLogin = await login('admin', ADMIN_PASSWORD);
  adminHeaders = { cookie: `${SESSION_COOKIE_NAME}=${readSessionId(adminLogin)}` };

  const created = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    headers: adminHeaders,
    payload: { username: 'viewer1', password: VIEWER_PASSWORD },
  });
  expect(created.statusCode).toBe(201);

  const viewerLogin = await login('viewer1', VIEWER_PASSWORD);
  viewerHeaders = { cookie: `${SESSION_COOKIE_NAME}=${readSessionId(viewerLogin)}` };
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe('CSS 效果 API — 认证与权限', () => {
  it('未登录访问分类与效果列表返回 401', async () => {
    const categories = await app.inject({ method: 'GET', url: '/api/css-effects/categories' });
    expect(categories.statusCode).toBe(401);

    const effects = await app.inject({ method: 'GET', url: '/api/css-effects/effects' });
    expect(effects.statusCode).toBe(401);
  });

  it('viewer 可以读取但不能写入', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/css-effects/categories',
      headers: viewerHeaders,
    });
    expect(list.statusCode).toBe(200);

    const create = await app.inject({
      method: 'POST',
      url: '/api/css-effects/categories',
      headers: viewerHeaders,
      payload: { name: 'viewer 分类' },
    });
    expect(create.statusCode).toBe(403);
  });
});

describe('CSS 效果 API — 种子数据', () => {
  it('默认返回 3 个分类与 6 条效果', async () => {
    const categories = await app.inject({
      method: 'GET',
      url: '/api/css-effects/categories',
      headers: viewerHeaders,
    });
    expect(categories.statusCode).toBe(200);
    expect(categories.json<EffectCategory[]>()).toHaveLength(3);

    const effects = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects',
      headers: viewerHeaders,
    });
    expect(effects.statusCode).toBe(200);
    expect(effects.json<CssEffect[]>()).toHaveLength(6);
  });
});

describe('CSS 效果 API — 分类管理', () => {
  it('创建分类成功，重名返回 409', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/css-effects/categories',
      headers: adminHeaders,
      payload: { name: '按钮', description: '按钮相关效果' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<EffectCategory>().name).toBe('按钮');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/css-effects/categories',
      headers: adminHeaders,
      payload: { name: '按钮' },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('创建分类时纯空白名称返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/css-effects/categories',
      headers: adminHeaders,
      payload: { name: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('更新不存在的分类返回 404', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/css-effects/categories/not-exist',
      headers: adminHeaders,
      payload: { name: '新名字' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('删除分类后其下效果出现在未分类列表中', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects?categoryId=cat-css',
      headers: adminHeaders,
    });
    const catEffects = before.json<CssEffect[]>();
    expect(catEffects.length).toBeGreaterThan(0);

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/css-effects/categories/cat-css',
      headers: adminHeaders,
    });
    expect(removed.statusCode).toBe(204);

    const uncategorized = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects?categoryId=null',
      headers: adminHeaders,
    });
    const ids = uncategorized.json<CssEffect[]>().map((effect) => effect.id);
    for (const effect of catEffects) {
      expect(ids).toContain(effect.id);
    }

    // 效果总数不变，分类已消失
    const all = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
    });
    expect(all.json<CssEffect[]>()).toHaveLength(6);

    const categories = await app.inject({
      method: 'GET',
      url: '/api/css-effects/categories',
      headers: adminHeaders,
    });
    expect(categories.json<EffectCategory[]>().some((c) => c.id === 'cat-css')).toBe(false);
  });

  it('删除不存在的分类返回 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/css-effects/categories/not-exist',
      headers: adminHeaders,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('CSS 效果 API — 效果管理', () => {
  it('创建效果时非法 effectType 返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: { name: '效果', effectType: 'invalid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('创建效果时纯空白名称返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: { name: '   ', effectType: 'css' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('创建效果可将空白 categoryId 归一为未分类', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: { name: '空白分类效果', effectType: 'css', categoryId: '   ' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<CssEffect>().categoryId).toBeNull();
  });

  it('更新不存在的效果返回 404', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/css-effects/effects/not-exist',
      headers: adminHeaders,
      payload: { name: '新名字' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('按类型搜索效果', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects?type=echarts',
      headers: adminHeaders,
    });
    expect(response.statusCode).toBe(200);
    const effects = response.json<CssEffect[]>();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => effect.effectType === 'echarts')).toBe(true);
  });

  it('批量转移效果到其他分类与未分类', async () => {
    const moved = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects/batch-move',
      headers: adminHeaders,
      payload: {
        effectIds: ['eff-breathing', 'eff-gradient-border'],
        targetCategoryId: 'cat-animation',
      },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json<{ moved: number }>().moved).toBe(2);

    const toNull = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects/batch-move',
      headers: adminHeaders,
      payload: { effectIds: ['eff-breathing'], targetCategoryId: null },
    });
    expect(toNull.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects/eff-breathing',
      headers: adminHeaders,
    });
    expect(detail.json<CssEffect>().categoryId).toBeNull();
  });

  it('批量转移到不存在的分类返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects/batch-move',
      headers: adminHeaders,
      payload: { effectIds: ['eff-breathing'], targetCategoryId: 'not-exist' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('删除单个效果后不可再查询到', async () => {
    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/css-effects/effects/eff-spinner',
      headers: adminHeaders,
    });
    expect(removed.statusCode).toBe(204);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/css-effects/effects/eff-spinner',
      headers: adminHeaders,
    });
    expect(detail.statusCode).toBe(404);
  });
});

describe('CSS 效果 API — 图片素材', () => {
  // 1x1 透明 PNG，用于验证上传与读取链路。
  const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  async function upload(dataUrl: string, headers: { cookie: string }) {
    return app.inject({
      method: 'POST',
      url: '/api/css-effects/assets',
      headers,
      payload: { dataUrl },
    });
  }

  it('未登录不能查看素材列表，viewer 不能上传', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/css-effects/assets' });
    expect(list.statusCode).toBe(401);

    const uploadByViewer = await upload(PNG_DATA_URL, viewerHeaders);
    expect(uploadByViewer.statusCode).toBe(403);
  });

  it('管理员上传 PNG 后可通过返回地址直接读取', async () => {
    const created = await upload(PNG_DATA_URL, adminHeaders);
    expect(created.statusCode).toBe(201);
    const asset = created.json<{ name: string; url: string; size: number }>();
    expect(asset.url).toBe(`/api/css-effects/assets/${asset.name}`);
    expect(asset.size).toBeGreaterThan(0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/css-effects/assets',
      headers: adminHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<Array<{ name: string }>>().some((item) => item.name === asset.name)).toBe(
      true,
    );

    // 预览 iframe 不带 Cookie 也应能读取图片
    const file = await app.inject({ method: 'GET', url: asset.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');
    expect(file.rawPayload.length).toBeGreaterThan(0);
  });

  it('非法 dataUrl 与不支持的类型返回 400', async () => {
    const invalid = await upload('not-a-data-url', adminHeaders);
    expect(invalid.statusCode).toBe(400);

    const svg = await upload(
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      adminHeaders,
    );
    expect(svg.statusCode).toBe(400);
  });

  it('非法文件名（路径穿越）返回 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/css-effects/assets/..%2F..%2Faccount.json',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('邮件接口回归', () => {
  it('/api/mail/verify 在未配置 SMTP 时返回 ok=false 而不是挂起', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/mail/verify',
      headers: adminHeaders,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ ok: boolean; message: string }>();
    expect(body.ok).toBe(false);
    expect(typeof body.message).toBe('string');
  });
});
