import { defineFeature } from '@repo/core';

import { ActivityPage } from './ActivityPage';
import { registerActivityHandlers } from './activity-store';

export const activityFeature = defineFeature({
  id: 'activity',
  name: '活动流',
  description: '订阅事件总线，实时展示来自其他功能模块的活动记录。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '在 setup 中订阅全局活动事件。',
      code: `setup({ eventBus }) {
  const off = eventBus.on('activity:record', (payload) => {
    // 处理活动记录
  });
  return off;
}`,
    },
    {
      text: '需要记录活动时向事件总线发送事件。',
      code: `eventBus.emit('activity:record', {
  title: '新增账号',
  featureId: 'demo',
});`,
    },
    {
      text: '在宿主注册功能，并保存取消订阅函数避免重复监听。',
      code: `export const featureRegistry = new FeatureRegistry([activityFeature]);`,
    },
  ],
  setup({ eventBus }) {
    registerActivityHandlers(eventBus);
  },
  routes: [{ path: '', label: '活动流', element: ActivityPage }],
});
