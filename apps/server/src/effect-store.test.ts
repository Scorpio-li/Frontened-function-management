import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DuplicateCategoryError, EffectStore } from './effect-store';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'ffm-effect-store-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function createStore(): Promise<EffectStore> {
  const store = new EffectStore(dataDir);
  await store.init();
  return store;
}

describe('EffectStore 初始化与种子数据', () => {
  it('首次 init 写入 3 个分类与 6 条效果', async () => {
    const store = await createStore();

    expect(store.listCategories()).toHaveLength(3);

    const effects = store.listEffects();
    expect(effects).toHaveLength(6);

    // 覆盖三种效果类型
    const types = new Set(effects.map((effect) => effect.effectType));
    expect(types.has('css')).toBe(true);
    expect(types.has('animation')).toBe(true);
    expect(types.has('echarts')).toBe(true);
  });

  it('已有数据文件时 init 不覆盖既有数据', async () => {
    const first = await createStore();
    const created = await first.createCategory({ name: '自定义分类' });

    const second = await createStore();
    expect(second.listCategories().some((category) => category.id === created.id)).toBe(true);
  });
});

describe('分类 CRUD', () => {
  it('创建分类后可查询到', async () => {
    const store = await createStore();
    const created = await store.createCategory({ name: '  按钮样式  ', description: '  描述  ' });

    expect(created.name).toBe('按钮样式');
    expect(created.description).toBe('描述');

    const found = store.findCategoryById(created.id);
    expect(found?.name).toBe('按钮样式');
  });

  it('分类名称重复时抛出 DuplicateCategoryError', async () => {
    const store = await createStore();
    await store.createCategory({ name: '重复名' });

    await expect(store.createCategory({ name: '重复名' })).rejects.toBeInstanceOf(
      DuplicateCategoryError,
    );
  });

  it('纯空白分类名称被拒绝', async () => {
    const store = await createStore();
    await expect(store.createCategory({ name: '   ' })).rejects.toThrow('分类名称需 1–32 字符');
  });

  it('编辑分类时与其他分类重名抛错', async () => {
    const store = await createStore();
    const first = await store.createCategory({ name: '分类A' });
    await store.createCategory({ name: '分类B' });

    await expect(store.updateCategory(first.id, { name: '分类B' })).rejects.toBeInstanceOf(
      DuplicateCategoryError,
    );
  });

  it('删除分类后其下效果归为未分类且不被删除', async () => {
    const store = await createStore();
    const totalBefore = store.listEffects().length;
    const catEffectsBefore = store.listEffects({ categoryId: 'cat-css' });
    expect(catEffectsBefore.length).toBeGreaterThan(0);

    const removed = await store.deleteCategory('cat-css');
    expect(removed).toBe(true);

    // 分类消失
    expect(store.findCategoryById('cat-css')).toBeUndefined();
    expect(store.listEffects({ categoryId: 'cat-css' })).toHaveLength(0);

    // 效果总数不变，且原分类效果进入未分类
    const totalAfter = store.listEffects().length;
    expect(totalAfter).toBe(totalBefore);

    const uncategorized = store.listEffects({ categoryId: null });
    for (const effect of catEffectsBefore) {
      expect(uncategorized.some((item) => item.id === effect.id)).toBe(true);
    }
  });

  it('删除不存在的分类返回 false', async () => {
    const store = await createStore();
    await expect(store.deleteCategory('not-exist')).resolves.toBe(false);
  });
});

describe('效果 CRUD 与查询', () => {
  it('创建效果时校验分类存在性', async () => {
    const store = await createStore();
    await expect(
      store.createEffect({ categoryId: 'not-exist', name: '效果', effectType: 'css' }),
    ).rejects.toThrow('所属分类不存在');
  });

  it('纯空白效果名称被拒绝', async () => {
    const store = await createStore();
    await expect(
      store.createEffect({ categoryId: null, name: '   ', effectType: 'css' }),
    ).rejects.toThrow('效果名称需 1–64 字符');
  });

  it('按 categoryId 过滤效果', async () => {
    const store = await createStore();
    const all = store.listEffects();
    const withCategory = store.listEffects({ categoryId: 'cat-echarts' });

    expect(withCategory.length).toBeGreaterThan(0);
    expect(withCategory.every((effect) => effect.categoryId === 'cat-echarts')).toBe(true);
    expect(withCategory.length).toBeLessThan(all.length);
  });

  it('按类型和关键字搜索效果', async () => {
    const store = await createStore();

    const byType = store.listEffects({ type: 'echarts' });
    expect(byType.length).toBeGreaterThan(0);
    expect(byType.every((effect) => effect.effectType === 'echarts')).toBe(true);

    const byName = store.listEffects({ q: '呼吸' });
    expect(byName.some((effect) => effect.name.includes('呼吸'))).toBe(true);

    const byTag = store.listEffects({ q: '加载' });
    expect(byTag.length).toBeGreaterThan(0);
  });

  it('编辑与删除单个效果', async () => {
    const store = await createStore();

    const updated = await store.updateEffect('eff-breathing', {
      name: '新名称',
      tags: [' a ', ''],
    });
    expect(updated?.name).toBe('新名称');
    expect(updated?.tags).toEqual(['a']);

    const removed = await store.deleteEffect('eff-breathing');
    expect(removed).toBe(true);
    expect(store.findEffectById('eff-breathing')).toBeUndefined();

    await expect(store.deleteEffect('eff-breathing')).resolves.toBe(false);
  });

  it('批量转移效果到目标分类与未分类', async () => {
    const store = await createStore();

    const moved = await store.batchMoveEffects(
      ['eff-breathing', 'eff-gradient-border'],
      'cat-animation',
    );
    expect(moved).toBe(2);
    expect(store.findEffectById('eff-breathing')?.categoryId).toBe('cat-animation');

    const movedToNull = await store.batchMoveEffects(['eff-breathing'], null);
    expect(movedToNull).toBe(1);
    expect(store.findEffectById('eff-breathing')?.categoryId).toBeNull();
  });

  it('批量转移到不存在的分类时抛错', async () => {
    const store = await createStore();
    await expect(store.batchMoveEffects(['eff-breathing'], 'not-exist')).rejects.toThrow(
      '目标分类不存在',
    );
  });
});

describe('并发写入', () => {
  it('并发创建分类全部成功且不丢数据', async () => {
    const store = await createStore();

    await Promise.all(
      Array.from({ length: 5 }, (_, index) => store.createCategory({ name: `并发分类-${index}` })),
    );

    expect(store.listCategories()).toHaveLength(3 + 5);
  });
});
