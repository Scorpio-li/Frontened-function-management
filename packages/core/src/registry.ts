import type { Feature, FeatureEntry, FeatureSetupContext } from './types';

/**
 * 功能注册表：维护功能清单与启用状态，并支持订阅变更。
 * 通过 `subscribe` + `getSnapshot` 可直接接入 React 的 `useSyncExternalStore`。
 */
export class FeatureRegistry {
  private entries: readonly FeatureEntry[];
  private readonly listeners = new Set<() => void>();

  constructor(features: readonly Feature[]) {
    const seen = new Set<string>();

    for (const feature of features) {
      if (!feature.id) {
        throw new Error('功能模块必须提供非空的 id');
      }
      if (seen.has(feature.id)) {
        throw new Error(`功能模块 id 重复: ${feature.id}`);
      }
      seen.add(feature.id);
    }

    this.entries = features.map((feature) => ({ feature, enabled: true }));
  }

  getSnapshot = (): readonly FeatureEntry[] => this.entries;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  list(): readonly FeatureEntry[] {
    return this.entries;
  }

  get(id: string): Feature | undefined {
    return this.entries.find((entry) => entry.feature.id === id)?.feature;
  }

  isEnabled(id: string): boolean {
    return this.entries.some((entry) => entry.feature.id === id && entry.enabled);
  }

  /** 切换启用状态；状态未变化时不触发订阅。 */
  setEnabled(id: string, enabled: boolean): void {
    const index = this.entries.findIndex((entry) => entry.feature.id === id);
    const current = this.entries[index];

    if (!current || current.enabled === enabled) {
      return;
    }

    const next = this.entries.slice();
    next[index] = { ...current, enabled };
    this.entries = next;

    for (const listener of this.listeners) {
      listener();
    }
  }

  /** 执行所有功能的 `setup`，与启用状态无关，确保后续启用时初始化已完成。 */
  setupAll(context: FeatureSetupContext): void {
    for (const entry of this.entries) {
      entry.feature.setup?.(context);
    }
  }
}
