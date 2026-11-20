import type { FeatureKind } from '@repo/contracts';

/** 功能类型的中文展示名，列表与表单共用。 */
export const FEATURE_KIND_LABELS: Record<FeatureKind, string> = {
  html: 'HTML',
  css: 'CSS',
  vue: 'Vue',
  react: 'React',
  echarts: 'ECharts',
  node: 'Node',
  other: '其他',
};
