import { describe, expect, it } from 'vitest';

import { resolveFeaturePath } from './types';

describe('resolveFeaturePath', () => {
  it('空路径返回功能根路由', () => {
    expect(resolveFeaturePath('dashboard', '')).toBe('/dashboard');
    expect(resolveFeaturePath('dashboard', '/')).toBe('/dashboard');
  });

  it('去除多余斜杠并拼接子路由', () => {
    expect(resolveFeaturePath('dashboard', 'settings')).toBe('/dashboard/settings');
    expect(resolveFeaturePath('dashboard', '/settings/')).toBe('/dashboard/settings');
  });
});
