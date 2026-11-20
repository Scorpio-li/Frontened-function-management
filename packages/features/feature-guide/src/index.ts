import { defineFeature } from '@repo/core';

import { GuidePage } from './GuidePage';

export const guideFeature = defineFeature({
  id: 'guide',
  name: '新手引导',
  description: '基于 intro.js，为后台页面添加分步新手引导。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装依赖并引入样式。',
      code: `pnpm add intro.js

import introJs from 'intro.js';
import 'intro.js/introjs.css';`,
    },
    {
      text: '给需要讲解的元素设置稳定 id。',
      code: `<div id="guide-step-feature">功能入口</div>`,
    },
    {
      text: '配置步骤并启动引导。',
      code: `introJs()
  .setOptions({
    nextLabel: '下一步',
    doneLabel: '完成',
    steps: [
      { element: '#guide-step-feature', intro: '这里是功能入口' },
    ],
  })
  .start();`,
    },
    {
      text: '通过回调处理完成与跳过。',
      code: `introJs().onComplete(() => {}).onExit(() => {}).start();`,
    },
  ],
  routes: [{ path: '', label: '新手引导', element: GuidePage }],
});
