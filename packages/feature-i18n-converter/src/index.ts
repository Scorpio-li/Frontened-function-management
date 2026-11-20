import { defineFeature } from '@repo/core';

import { I18nConverterPage } from './I18nConverterPage';

export const i18nConverterFeature = defineFeature({
  id: 'i18n-converter',
  name: '国际化转换',
  description: 'JSON 与 Excel 之间相互转换，适用于多语言配置文件的批量编辑与导出。',
  version: '0.1.0',
  implementationSteps: [
    {
      text: '在功能包中安装 xlsx 依赖。',
      code: 'pnpm add xlsx',
    },
    {
      text: '在 React 组件中导入 xlsx 并实现转换逻辑。',
      code: `import * as XLSX from 'xlsx';

// JSON → Excel
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(
  Object.entries(jsonData).map(([key, value]) => ({ Key: key, Value: value }))
);
XLSX.utils.book_append_sheet(workbook, worksheet, 'Translations');
XLSX.writeFile(workbook, 'translations.xlsx');

// Excel → JSON
const workbook = XLSX.read(data, { type: 'array' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);
const json = rows.reduce((acc, row) => ({ ...acc, [row[keys[0]]]: row[keys[1]] }), {});`,
    },
    {
      text: '在宿主注册功能。',
      code: `// apps/web/src/features.ts
import { i18nConverterFeature } from '@repo/feature-i18n-converter';
export const featureRegistry = new FeatureRegistry([..., i18nConverterFeature]);`,
    },
    {
      text: '添加工作区依赖并安装。',
      code: `"@repo/feature-i18n-converter": "workspace:*"

pnpm install`,
    },
    {
      text: '运行全量检查验证接入结果。',
      code: 'pnpm check',
    },
  ],
  routes: [{ path: '', label: 'JSON ↔ Excel', element: I18nConverterPage }],
});
