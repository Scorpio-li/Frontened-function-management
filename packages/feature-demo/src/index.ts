import { defineFeature } from '@repo/core';

import { DemoPage } from './DemoPage';

export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  description: '用于演示功能包标准结构。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '以本包为标准模板，复制为自己的功能包。',
      code: 'cp -r packages/feature-demo packages/feature-<id>',
    },
    {
      text: '声明功能元信息、路由与实现步骤。',
      code: `export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  implementationSteps: [
    { text: '安装依赖', code: 'pnpm add <library>' },
  ],
  routes: [{ path: '', label: '示例', element: DemoPage }],
});`,
    },
    {
      text: '把页面组件放在 src 下，使用独立类名前缀避免污染全局样式。',
      code: `// src/DemoPage.tsx
export function DemoPage() {
  return <div className="demo-page">示例</div>;
}`,
    },
    {
      text: '在宿主注册并安装依赖。',
      code: `// apps/web/src/features.ts
new FeatureRegistry([demoFeature]);

// apps/web/package.json
"@repo/feature-demo": "workspace:*"

pnpm install`,
    },
  ],
  routes: [{ path: '', label: '示例', element: DemoPage }],
});
