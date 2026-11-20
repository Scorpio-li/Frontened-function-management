import type { ComponentType } from 'react';

import { CategoryEffectsPage } from './CategoryEffectsPage';
import { CategoryManagePage } from './CategoryManagePage';
import { useCategoryNavItems } from './shared';
import type { CategoryNavItem } from './shared';

/** 平台模块路由：path 为宿主可直接挂载的绝对路径。 */
export interface CssEffectRoute {
  readonly path: string;
  readonly label: string;
  readonly element: ComponentType;
  /** 为 true 时不渲染为侧边栏静态项（由动态子菜单提供入口）。 */
  readonly hidden?: boolean;
}

/** CSS 效果平台模块描述，供宿主注册路由与导航。 */
export interface CssEffectPlatform {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly basePath: string;
  readonly routes: readonly CssEffectRoute[];
  /** 侧边栏动态子菜单（未分类 + 各分类）。 */
  readonly useNavItems: () => readonly CategoryNavItem[];
}

export const cssEffectPlatform: CssEffectPlatform = {
  id: 'css-effect',
  name: 'CSS 效果',
  description: 'CSS 样式效果、动画、ECharts 可视化资产库',
  basePath: '/css-effect',
  routes: [
    { path: '/css-effect', label: '分类管理', element: CategoryManagePage },
    {
      path: '/css-effect/category/:categoryId',
      label: '分类效果',
      element: CategoryEffectsPage,
      hidden: true,
    },
  ],
  useNavItems: useCategoryNavItems,
};

export { CategoryManagePage, CategoryEffectsPage };
export { EffectPreview } from './EffectPreview';
export type { CssEffect, EffectCategory, EffectType } from './types';
export { UNCATEGORIZED_ID, UNCATEGORIZED_NAME } from './types';
