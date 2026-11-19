import { defineFeature } from '@repo/core';

import { DemoPage } from './DemoPage';

export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  description: '用于演示功能包标准结构。',
  version: '0.1.0',
  routes: [{ path: '', label: '示例', element: DemoPage }],
});
