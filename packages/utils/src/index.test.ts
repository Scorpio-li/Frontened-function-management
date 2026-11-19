import { describe, expect, it } from 'vitest';

import { cn, createId, formatDateTime } from './index';

describe('cn', () => {
  it('拼接有效 class 并过滤假值', () => {
    expect(cn('a', false, null, undefined, 'b', '')).toBe('a b');
  });
});

describe('createId', () => {
  it('使用默认前缀', () => {
    expect(createId()).toMatch(/^id_/);
  });

  it('使用自定义前缀且结果唯一', () => {
    const first = createId('activity');
    const second = createId('activity');

    expect(first).toMatch(/^activity_/);
    expect(first).not.toBe(second);
  });
});

describe('formatDateTime', () => {
  it('按本地时间格式化', () => {
    expect(formatDateTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05');
  });

  it('非法时间返回占位符', () => {
    expect(formatDateTime('not-a-date')).toBe('--');
  });
});
