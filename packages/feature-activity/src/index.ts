import { defineFeature } from '@repo/core';

import { ActivityPage } from './ActivityPage';
import { registerActivityHandlers } from './activity-store';

export const activityFeature = defineFeature({
  id: 'activity',
  name: '活动流',
  description: '订阅事件总线，实时展示来自其他功能模块的活动记录。',
  version: '0.1.0',
  setup({ eventBus }) {
    registerActivityHandlers(eventBus);
  },
  routes: [{ path: '', label: '活动流', element: ActivityPage }],
});
