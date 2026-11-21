export type EffectType = 'css' | 'animation' | 'echarts';

export interface EffectCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CssEffect {
  id: string;
  categoryId: string | null;
  name: string;
  description?: string;
  effectType: EffectType;
  tags: string[];
  html?: string;
  css?: string;
  js?: string;
  echartsOption?: unknown;
  /** 预览时注入的 CDN 链接（.css 作为样式，其余作为脚本）。 */
  cdnUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 前端用于表示「未分类」的 URL 片段与展示名。 */
export const UNCATEGORIZED_ID = 'uncategorized';
export const UNCATEGORIZED_NAME = '未分类';

/** 把 URL 中的 categoryId 片段转换为接口所需的 categoryId（未分类为 null）。 */
export function parseCategoryIdParam(param: string | undefined): string | null {
  if (!param || param === UNCATEGORIZED_ID) return null;
  return param;
}

/** 把接口返回的 categoryId 转换为 URL 片段。 */
export function toCategoryIdParam(categoryId: string | null): string {
  return categoryId ?? UNCATEGORIZED_ID;
}
