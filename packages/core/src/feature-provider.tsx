import type { ReactNode } from 'react';

import type { EventBus } from './event-bus';
import { FeatureRuntimeContext } from './feature-context';
import type { FeatureRegistry } from './registry';

export interface FeatureProviderProps {
  registry: FeatureRegistry;
  eventBus: EventBus;
  children: ReactNode;
}

/** 向功能模块注入注册表与事件总线。 */
export function FeatureProvider({ registry, eventBus, children }: FeatureProviderProps) {
  return (
    <FeatureRuntimeContext.Provider value={{ registry, eventBus }}>
      {children}
    </FeatureRuntimeContext.Provider>
  );
}
