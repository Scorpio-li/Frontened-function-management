import type { AppEventMap } from './types';

type Handler = (payload: never) => void;

/**
 * 宿主与功能模块之间的事件总线，用于跨模块通信。
 */
export class EventBus {
  private readonly handlers = new Map<string, Set<Handler>>();

  /** 订阅事件，返回取消订阅函数。 */
  on<K extends keyof AppEventMap & string>(
    type: K,
    handler: (payload: AppEventMap[K]) => void,
  ): () => void {
    const listeners = this.handlers.get(type) ?? new Set<Handler>();
    listeners.add(handler as Handler);
    this.handlers.set(type, listeners);

    return () => {
      this.off(type, handler);
    };
  }

  /** 移除指定监听器。 */
  off<K extends keyof AppEventMap & string>(
    type: K,
    handler: (payload: AppEventMap[K]) => void,
  ): void {
    const listeners = this.handlers.get(type);
    if (!listeners) {
      return;
    }

    listeners.delete(handler as Handler);
    if (listeners.size === 0) {
      this.handlers.delete(type);
    }
  }

  /** 广播事件；没有订阅者时静默返回。 */
  emit<K extends keyof AppEventMap & string>(type: K, payload: AppEventMap[K]): void {
    const listeners = this.handlers.get(type);
    if (!listeners) {
      return;
    }

    for (const handler of [...listeners]) {
      handler(payload as never);
    }
  }

  /** 清空某一类事件的监听器，或清空全部。 */
  clear(type?: keyof AppEventMap & string): void {
    if (type === undefined) {
      this.handlers.clear();
      return;
    }

    this.handlers.delete(type);
  }

  /** 返回当前事件的监听器数量，主要用于测试与调试。 */
  listenerCount(type: keyof AppEventMap & string): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}

export function createEventBus(): EventBus {
  return new EventBus();
}
