import { describe, expect, it, vi } from 'vitest';

import { EventBus, createEventBus } from './event-bus';

describe('EventBus', () => {
  it('按事件类型派发负载', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const payload = { title: '发布 0.1.0', featureId: 'dashboard' };

    bus.on('activity:record', handler);
    bus.emit('activity:record', payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('支持多个监听器，取消订阅函数只移除自身', () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = bus.on('activity:record', first);

    bus.on('activity:record', second);
    offFirst();
    bus.emit('activity:record', { title: '记录', featureId: 'dashboard' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('off 只移除指定监听器', () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();

    bus.on('activity:clear', first);
    bus.on('activity:clear', second);
    bus.off('activity:clear', first);
    bus.emit('activity:clear', undefined);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('activity:clear')).toBe(1);
  });

  it('clear 支持按类型或全量清理', () => {
    const bus = new EventBus();
    const recordHandler = vi.fn();
    const clearHandler = vi.fn();

    bus.on('activity:record', recordHandler);
    bus.on('activity:clear', clearHandler);
    bus.clear('activity:record');
    bus.clear();

    expect(bus.listenerCount('activity:record')).toBe(0);
    expect(bus.listenerCount('activity:clear')).toBe(0);
  });
});
