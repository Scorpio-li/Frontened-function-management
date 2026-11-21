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

  it('创建与更新效果时支持 CDN 链接，非法链接返回 400', async () => {
    const cdnUrls = [
      'https://cdn.jsdelivr.net/npm/animejs/lib/anime.min.js',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC" />',
    ];
    const created = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: {
        name: 'CDN 效果',
        effectType: 'css',
        cdnUrls,
      },
    });
    expect(created.statusCode).toBe(201);
    const effect = created.json<CssEffect>();
    expect(effect.cdnUrls).toEqual(cdnUrls);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/css-effects/effects/${effect.id}`,
      headers: adminHeaders,
      payload: { cdnUrls: ['https://cdn.jsdelivr.net/npm/normalize.css/normalize.css'] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<CssEffect>().cdnUrls).toEqual([
      'https://cdn.jsdelivr.net/npm/normalize.css/normalize.css',
    ]);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: { name: '非法 CDN', effectType: 'css', cdnUrls: ['javascript:alert(1)'] },
    });
    expect(invalid.statusCode).toBe(400);
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
  const EFFECT_ID = 'eff-breathing';

  async function upload(
    dataUrl: string,
    headers: { cookie: string },
    effectId = EFFECT_ID,
  ): Promise<InjectResponse> {
    return app.inject({
      method: 'POST',
      url: '/api/css-effects/assets',
      headers,
      payload: { dataUrl, effectId, fileName: 'demo.png' },
    });
  }

  async function listAssets(effectId: string, headers: { cookie: string }) {
    return app.inject({
      method: 'GET',
      url: `/api/css-effects/assets?effectId=${encodeURIComponent(effectId)}`,
      headers,
    });
  }

  it('未登录不能查看素材列表，viewer 不能上传', async () => {
    const list = await app.inject({
      method: 'GET',
      url: `/api/css-effects/assets?effectId=${EFFECT_ID}`,
    });
    expect(list.statusCode).toBe(401);

    const missingEffectId = await app.inject({
      method: 'GET',
      url: '/api/css-effects/assets',
      headers: viewerHeaders,
    });
    expect(missingEffectId.statusCode).toBe(400);

    const uploadByViewer = await upload(PNG_DATA_URL, viewerHeaders);
    expect(uploadByViewer.statusCode).toBe(403);
  });

  it('管理员上传 PNG 后只能在自己的效果下看到，并可通过地址读取', async () => {
    const created = await upload(PNG_DATA_URL, adminHeaders);
    expect(created.statusCode).toBe(201);
    const asset = created.json<{ name: string; url: string; size: number; fileName: string }>();
    expect(asset.url).toBe(`/api/css-effects/assets/${asset.name}`);
    expect(asset.fileName).toBe('demo.png');
    expect(asset.size).toBeGreaterThan(0);

    const ownList = await listAssets(EFFECT_ID, adminHeaders);
    expect(ownList.statusCode).toBe(200);
    expect(ownList.json<Array<{ name: string }>>().some((item) => item.name === asset.name)).toBe(
      true,
    );

    // 其他效果的素材列表不应包含本次上传的图片
    const otherList = await listAssets('eff-spinner', adminHeaders);
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json<Array<{ name: string }>>().some((item) => item.name === asset.name)).toBe(
      false,
    );

    // 预览 iframe 不带 Cookie 也应能读取图片
    const file = await app.inject({ method: 'GET', url: asset.url });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');
    expect(file.rawPayload.length).toBeGreaterThan(0);
  });

  it('素材可以重命名与删除，且不能跨效果操作', async () => {
    const created = await upload(PNG_DATA_URL, adminHeaders);
    const asset = created.json<{ name: string }>();

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/css-effects/assets/${asset.name}`,
      headers: adminHeaders,
      payload: { effectId: EFFECT_ID, fileName: '新名字.png' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<{ fileName: string }>().fileName).toBe('新名字.png');

    const crossRename = await app.inject({
      method: 'PATCH',
      url: `/api/css-effects/assets/${asset.name}`,
      headers: adminHeaders,
      payload: { effectId: 'eff-spinner', fileName: '越权.png' },
    });
    expect(crossRename.statusCode).toBe(404);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/css-effects/assets/${asset.name}?effectId=${EFFECT_ID}`,
      headers: adminHeaders,
    });
    expect(removed.statusCode).toBe(204);

    const file = await app.inject({ method: 'GET', url: `/api/css-effects/assets/${asset.name}` });
    expect(file.statusCode).toBe(404);
  });

  it('新建效果时 draft 素材会转移到新效果', async () => {
    const draftId = 'draft-test-assets';
    const created = await upload(PNG_DATA_URL, adminHeaders, draftId);
    const asset = created.json<{ name: string }>();

    const effectResponse = await app.inject({
      method: 'POST',
      url: '/api/css-effects/effects',
      headers: adminHeaders,
      payload: { name: '带素材效果', effectType: 'css', draftId },
    });
    expect(effectResponse.statusCode).toBe(201);
    const effectId = effectResponse.json<CssEffect>().id;

    const assets = await listAssets(effectId, adminHeaders);
    expect(assets.json<Array<{ name: string }>>().some((item) => item.name === asset.name)).toBe(
      true,
    );

    // 草稿归属下不再有素材
    const draftAssets = await listAssets(draftId, adminHeaders);
    expect(draftAssets.json<Array<{ name: string }>>()).toHaveLength(0);
  });

  it('删除效果时同步清理其素材', async () => {
    const created = await upload(PNG_DATA_URL, adminHeaders);
    const asset = created.json<{ name: string }>();

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/css-effects/effects/${EFFECT_ID}`,
      headers: adminHeaders,
    });
    expect(removed.statusCode).toBe(204);

    const file = await app.inject({ method: 'GET', url: `/api/css-effects/assets/${asset.name}` });
    expect(file.statusCode).toBe(404);
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
