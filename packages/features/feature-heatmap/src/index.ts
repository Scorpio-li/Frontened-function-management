import { defineFeature } from '@repo/core';

import { HeatmapPage } from './HeatmapPage';

export const heatmapFeature = defineFeature({
  id: 'heatmap',
  name: '数据热力图',
  description: '基于 Heat.js，把日期数据渲染为可交互的热力图层。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装依赖并引入样式。',
      code: `pnpm add jheat.js

import 'jheat.js';
import 'jheat.js/dist/heat.js.css';`,
    },
    {
      text: '放置带 data-heat-js 配置的容器，Heat.js 会自动挂载。',
      code: `<div
  id="heat-map"
  data-heat-js='{"views":{"map":{"showDayNames":true}}}'
/>`,
    },
    {
      text: '写入数据并刷新，triggerUpdate 为 false 时最后统一刷新。',
      code: `window.$heat.addDate('heat-map', new Date(), null, false);
window.$heat.refreshAll();`,
    },
    {
      text: '重置数据时调用 reset，避免重复累计。',
      code: `window.$heat.reset('heat-map', false);`,
    },
  ],
  routes: [{ path: '', label: '热力图', element: HeatmapPage }],
});
