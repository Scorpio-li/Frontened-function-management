import { defineFeature } from '@repo/core';

import { InfographicPage } from './InfographicPage';

export const infographicFeature = defineFeature({
  id: 'infographic',
  name: '信息图可视化',
  description: '基于 @antv/infographic，用声明式语法生成信息图。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装依赖。',
      code: 'pnpm add @antv/infographic',
    },
    {
      text: '初始化实例并绑定容器。',
      code: `const infographic = new Infographic({
  container,
  width: '100%',
  height: 460,
});`,
    },
    {
      text: '使用声明式语法渲染，修改后再次 render 即可更新。',
      code: `infographic.render(\`infographic list-row-simple-horizontal-arrow
data
  title 功能接入流程
  lists
    - label 需求分析
      desc 明确目标与范围\`);`,
    },
    {
      text: '组件卸载时销毁实例。',
      code: 'return () => infographic.destroy();',
    },
  ],
  routes: [{ path: '', label: '信息图', element: InfographicPage }],
});
