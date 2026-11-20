import { defineFeature } from '@repo/core';

import { RelationshipPage } from './RelationshipPage';

export const relationshipFeature = defineFeature({
  id: 'relationship',
  name: '亲戚关系计算器',
  description: '输入中文亲属称谓，计算对应的称呼、关系链或关系合称。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '在功能包中安装依赖。',
      code: 'pnpm add relationship-ts',
    },
    {
      text: '引入计算函数并按模式调用。',
      code: `import relationship from 'relationship-ts';

relationship({ text: '爸爸的妈妈' });
relationship({ text: '外婆', reverse: true, sex: 1 });
relationship({ text: '舅公', type: 'chain' });
relationship({ text: '外婆', target: '奶奶', type: 'pair' });`,
    },
    {
      text: '自然语言模式直接传入问句字符串。',
      code: `relationship('舅妈如何称呼外婆？'); // ['婆婆']`,
    },
    {
      text: '渲染返回的 string[]，并对空结果给出提示。',
      code: `const results = relationship({ text });
{results.map((item) => <Badge key={item}>{item}</Badge>)}`,
    },
  ],
  routes: [{ path: '', label: '关系计算', element: RelationshipPage }],
});
