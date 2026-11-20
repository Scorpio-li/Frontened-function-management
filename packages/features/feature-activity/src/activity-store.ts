import { useSyncExternalStore } from 'react';

import type { ActivityRecord, EventBus } from '@repo/core';
import { createId } from '@repo/utils';

const LIMIT = 20;

let records: ActivityRecord[] = [];
let snapshot: readonly ActivityRecord[] = [];
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = [...records];
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly ActivityRecord[] {
  return snapshot;
}

/** 订阅活动记录；日志保存在模块内存中，切换页面不会丢失。 */
export function useActivityRecords(): readonly ActivityRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 在功能初始化阶段接入事件总线。 */
export function registerActivityHandlers(eventBus: EventBus): void {
  eventBus.on('activity:record', (input) => {
    const record: ActivityRecord = {
      ...input,
      id: createId('activity'),
      createdAt: new Date().toISOString(),
    };

    records = [record, ...records].slice(0, LIMIT);
    publish();
  });

  eventBus.on('activity:clear', () => {
    records = [];
    publish();
  });
}
