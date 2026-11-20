import { defineFeature } from '@repo/core';

import { AnnotationPage } from './AnnotationPage';

export const annotationFeature = defineFeature({
  id: 'annotation',
  name: '图片选区标注',
  description: '基于 Fabric.js，在图片上绘制选区、矩形与文字标注。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装依赖并初始化画布。',
      code: `pnpm add fabric

const canvas = new Canvas(canvasEl, { width: 960, height: 520 });`,
    },
    {
      text: '加载背景图片。',
      code: `const image = await FabricImage.fromURL(imageUrl);
image.scaleToWidth(canvas.getWidth());
canvas.backgroundImage = image;
canvas.requestRenderAll();`,
    },
    {
      text: '添加矩形、文字或开启画笔标注。',
      code: `canvas.add(new Rect({ left: 80, top: 80, width: 200, height: 110, stroke: '#ff3b30' }));
canvas.add(new IText('标注文字', { left: 100, top: 220, fill: '#ff3b30' }));

const brush = new PencilBrush(canvas);
brush.color = '#ff3b30';
canvas.freeDrawingBrush = brush;
canvas.isDrawingMode = true;`,
    },
    {
      text: '组件卸载时释放画布。',
      code: 'return () => void canvas.dispose();',
    },
  ],
  routes: [{ path: '', label: '图片标注', element: AnnotationPage }],
});
