import { createEventBus, FeatureRegistry } from '@repo/core';
import { activityFeature } from '@repo/feature-activity';
import { annotationFeature } from '@repo/feature-annotation';
import { dashboardFeature } from '@repo/feature-dashboard';
import { demoFeature } from '@repo/feature-demo';
import { guideFeature } from '@repo/feature-guide';
import { heatmapFeature } from '@repo/feature-heatmap';
import { infographicFeature } from '@repo/feature-infographic';
import { pdfExportFeature } from '@repo/feature-pdf-export';
import { relationshipFeature } from '@repo/feature-relationship';

const STORAGE_KEY = 'ffm:disabled-features';

/** 新增功能模块时，只需要在这里注册。 */
export const featureRegistry = new FeatureRegistry([
  dashboardFeature,
  activityFeature,
  demoFeature,
  relationshipFeature,
  heatmapFeature,
  annotationFeature,
  pdfExportFeature,
  infographicFeature,
  guideFeature,
]);

export const eventBus = createEventBus();

function readDisabledFeatures(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

const disabledFeatures = new Set(readDisabledFeatures());
for (const entry of featureRegistry.list()) {
  if (disabledFeatures.has(entry.feature.id)) {
    featureRegistry.setEnabled(entry.feature.id, false);
  }
}

featureRegistry.subscribe(() => {
  const disabled = featureRegistry
    .list()
    .filter((entry) => !entry.enabled)
    .map((entry) => entry.feature.id);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(disabled));
});

// setup 与启停状态解耦：即使模块当前被停用，也先完成初始化，
// 后续重新启用时事件监立即生效。
featureRegistry.setupAll({ eventBus });
