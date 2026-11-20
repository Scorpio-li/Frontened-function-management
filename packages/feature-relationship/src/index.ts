import { defineFeature } from '@repo/core';

import { RelationshipPage } from './RelationshipPage';

export const relationshipFeature = defineFeature({
  id: 'relationship',
  name: '亲戚关系计算器',
  description: '输入中文亲属称谓，计算对应的称呼、关系链或关系合称。',
  version: '0.1.0',
  routes: [{ path: '', label: '关系计算', element: RelationshipPage }],
});
