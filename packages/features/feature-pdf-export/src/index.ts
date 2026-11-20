import { defineFeature } from '@repo/core';

import { PdfExportPage } from './PdfExportPage';

export const pdfExportFeature = defineFeature({
  id: 'pdf-export',
  name: '网页转 PDF',
  description: '基于 dompdf.js，把网页内容生成为可编辑、可打印的矢量 PDF。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '安装依赖，并准备中文字体文件（TTF）。',
      code: 'pnpm add dompdf.js',
    },
    {
      text: 'dompdf.js 只识别 fontBytes / fontBase64，需要先自行下载字体。',
      code: `const fontBytes = new Uint8Array(
  await (await fetch('/fonts/NotoSansSC-Regular.ttf')).arrayBuffer(),
);`,
    },
    {
      text: '按字重注册中文字体，避免加粗文本回退到西文字体。',
      code: `fontConfig: [
  { fontFamily: 'Noto Sans SC', fontWeight: 400, fontBytes },
  { fontFamily: 'Noto Sans SC', fontWeight: 700, fontBytes },
]`,
    },
    {
      text: '导出 Blob 预览或直接下载，容器需使用同一字体族。',
      code: `const blob = await dompdf(element, options);
await downloadPDF(element, options, 'demo.pdf');`,
    },
  ],
  routes: [{ path: '', label: '网页转 PDF', element: PdfExportPage }],
});
