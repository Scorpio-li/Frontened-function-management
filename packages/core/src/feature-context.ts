import { createContext } from 'react';

import type { EventBus } from './event-bus';
import type { FeatureRegistry } from './registry';

export interface FeatureRuntime {
  readonly registry: FeatureRegistry;
  readonly eventBus: EventBus;
}

export const FeatureRuntimeContext = createContext<FeatureRuntime | null>(null);
