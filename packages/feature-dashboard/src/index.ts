import { defineFeature } from '@repo/core';

import { DashboardPage } from './DashboardPage';

export const dashboardFeature = defineFeature({
  id: 'dashboard',
  name: '功能概览',
  description: '展示当前注册的功能模块，并通过事件总线演示跨模块通信。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '复制示例功能包并修改包名与目录名。',
      code: 'cp -r packages/feature-dashboard packages/feature-<id>',
    },
    {
      text: '在 src/index.ts 中用 defineFeature 声明功能契约。',
      code: `export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  routes: [{ path: '', label: '首页', element: DemoPage }],
});`,
    },
    {
      text: '在宿主注册功能。',
      code: `// apps/web/src/features.ts
export const featureRegistry = new FeatureRegistry([dashboardFeature, demoFeature]);`,
    },
    {
      text: '添加工作区依赖并安装。',
      code: `// apps/web/package.json
"@repo/feature-demo": "workspace:*"

pnpm install`,
    },
    {
      text: '运行全量检查验证接入结果。',
      code: 'pnpm check',
    },
  ],
  routes: [{ path: '', label: '概览', element: DashboardPage }],
});
