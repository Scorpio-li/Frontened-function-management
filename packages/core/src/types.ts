import type { ComponentType } from 'react';

import type { EventBus } from './event-bus';

/**
 * 功能模块内的一个页面路由。
 * `path` 为相对路径，空字符串表示该功能的首页。
 */
export interface FeatureRoute {
  readonly path: string;
  readonly label: string;
  readonly element: ComponentType;
}

/** 功能模块初始化上下文。 */
export interface FeatureSetupContext {
  readonly eventBus: EventBus;
}

/** 功能实现步骤，供其他项目复用同样能力。 */
export interface FeatureImplementationStep {
  readonly text: string;
  /** 与步骤对应的代码示例，可选。 */
  readonly code?: string;
}

/**
 * 功能模块的声明式契约。
 * 功能包只描述元信息、路由与初始化逻辑，宿主负责渲染与导航。
 */
export interface Feature {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly routes: readonly FeatureRoute[];
  /**
   * 功能实现步骤，会展示在功能页面下方，方便在其他项目中复用同样能力。
   * 新增功能时必须填写。
   */
  readonly implementationSteps?: readonly FeatureImplementationStep[];
  /** 应用启动时执行一次，适合注册事件监听等副作用。 */
  setup?(context: FeatureSetupContext): void;
}

/** 注册表中的功能条目，包含运行时启停状态。 */
export interface FeatureEntry {
  readonly feature: Feature;
  readonly enabled: boolean;
}

/** 记录活动时由功能模块提交的负载。 */
export interface ActivityInput {
  readonly title: string;
  readonly description?: string;
  readonly featureId: string;
}

/** 活动流的完整记录。 */
export interface ActivityRecord extends ActivityInput {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * 宿主内置事件契约。
 * 业务方可通过 `declare module '@repo/core'` 做接口合并来扩展事件类型。
 */
export interface AppEventMap {
  'activity:record': ActivityInput;
  'activity:clear': undefined;
}

/** 提供类型推断的辅助函数，避免手写 `Feature` 泛型。 */
export function defineFeature(feature: Feature): Feature {
  return feature;
}

/**
 * 将功能 ID 与相对路径拼成绝对路由。
 * 例如 `resolveFeaturePath('dashboard', 'settings')` 返回 `/dashboard/settings`。
 */
export function resolveFeaturePath(featureId: string, routePath: string): string {
  const normalized = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized ? `/${featureId}/${normalized}` : `/${featureId}`;
}
