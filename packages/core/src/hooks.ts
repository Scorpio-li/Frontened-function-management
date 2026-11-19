import { useContext, useSyncExternalStore } from 'react';

import type { EventBus } from './event-bus';
import { FeatureRuntimeContext } from './feature-context';
import type { FeatureRuntime } from './feature-context';
import type { FeatureRegistry } from './registry';
import type { FeatureEntry } from './types';

function useFeatureRuntime(): FeatureRuntime {
  const runtime = useContext(FeatureRuntimeContext);

  if (!runtime) {
    throw new Error('功能模块 API 必须在 <FeatureProvider> 内使用');
  }

  return runtime;
}

export function useFeatureRegistry(): FeatureRegistry {
  return useFeatureRuntime().registry;
}

/** 订阅功能注册表，启停状态变化时触发重渲染。 */
export function useFeatures(): readonly FeatureEntry[] {
  const { registry } = useFeatureRuntime();

  return useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
}

export function useEventBus(): EventBus {
  return useFeatureRuntime().eventBus;
}
