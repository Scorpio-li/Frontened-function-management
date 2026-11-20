import { cssEffectPlatform } from '@repo/css-effect';

/**
 * 平台模块：与「功能管理」平级的独立模块（不属于 FeatureRegistry 的功能包）。
 * 每个模块自带路由与侧边栏动态子菜单。
 */
export const platformModules = [cssEffectPlatform];

export type PlatformModule = (typeof platformModules)[number];
