import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from './event-bus';
import { FeatureRegistry } from './registry';
import type { Feature } from './types';

const dashboard: Feature = {
  id: 'dashboard',
  name: '概览',
  routes: [{ path: '', label: '概览', element: () => null }],
};

const activity: Feature = {
  id: 'activity',
  name: '活动流',
  routes: [{ path: '', label: '活动流', element: () => null }],
};

describe('FeatureRegistry', () => {
  it('注册功能并默认全部启用', () => {
    const registry = new FeatureRegistry([dashboard, activity]);

    expect(registry.list()).toHaveLength(2);
    expect(registry.isEnabled('dashboard')).toBe(true);
    expect(registry.get('activity')?.name).toBe('活动流');
  });

  it('拒绝重复的功能 id', () => {
    expect(() => new FeatureRegistry([dashboard, dashboard])).toThrow(/id 重复/);
  });

  it('拒绝空 id', () => {
    expect(() => new FeatureRegistry([{ ...dashboard, id: '' }])).toThrow(/非空的 id/);
  });

  it('切换状态时通知订阅者，状态未变化则跳过', () => {
    const registry = new FeatureRegistry([dashboard]);
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.setEnabled('dashboard', false);
    expect(registry.isEnabled('dashboard')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.setEnabled('dashboard', false);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.setEnabled('dashboard', true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registry.setEnabled('dashboard', false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('保持快照引用稳定，仅在变更后替换', () => {
    const registry = new FeatureRegistry([dashboard]);
    const first = registry.getSnapshot();

    expect(registry.getSnapshot()).toBe(first);

    registry.setEnabled('dashboard', false);
    expect(registry.getSnapshot()).not.toBe(first);
  });

  it('setupAll 执行所有功能的初始化逻辑', () => {
    const setup = vi.fn();
    const registry = new FeatureRegistry([{ ...dashboard, setup }]);

    registry.setupAll({ eventBus: createEventBus() });

    expect(setup).toHaveBeenCalledTimes(1);
  });
});
