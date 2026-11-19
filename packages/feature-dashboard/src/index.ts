import { defineFeature } from '@repo/core';

import { DashboardPage } from './DashboardPage';

export const dashboardFeature = defineFeature({
  id: 'dashboard',
  name: '功能概览',
  description: '展示当前注册的功能模块，并通过事件总线演示跨模块通信。',
  version: '0.1.0',
  routes: [{ path: '', label: '概览', element: DashboardPage }],
});
