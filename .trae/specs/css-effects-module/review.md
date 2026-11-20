# CSS 效果模块 — Review

> Spec: `.trae/specs/css-effects-module/spec.md`
> 审阅日期：2026-11-20
> 审阅人：独立 Reviewer（general_purpose_task 子 agent）
> 质量门禁：`pnpm check` 18/18 全绿

---

## Review Result: ✅ pass

所有必检项通过，无阻塞性问题。

---

## 安全（NFR-07 / NFR-08 / NFR-09）

- ✅ iframe sandbox 不带 allow-same-origin（EffectPreview.tsx L41 thumb 模式 sandbox=""、L60 full 模式 sandbox="allow-scripts"）
- ✅ iframe 只用 srcdoc，不拼接用户 URL（EffectPreview.tsx 全文用 `<iframe srcdoc={doc}>`）
- ✅ 所有写 API 校验 admin 角色（app.ts L424/L437/L444/L453/L463/L473/L497/L512/L522/L533/L543/L553/L581）
- ✅ 所有 API 都校验登录态（resolveCurrentUser 在 app.ts 路由开始处统一调用）
- ✅ 代码复制用 navigator.clipboard.writeText 纯文本，不执行代码（CssEffectsPage.tsx / EffectDetailPage.tsx）

---

## 删除分类安全策略（AC C-04）

- ✅ EffectStore.deleteCategory(id) 将该分类下所有效果 categoryId 置为 null（effect-store.ts L358–365）
- ✅ 不删除效果本身：`this.effects.filter((e) => e.id !== id)` 只过滤效果本身
- ✅ 前端删除分类后切回 UNCATEGORIZED_ID，重新拉 GET `/api/css-effects/effects?categoryId=null`

---

## 路由可达性（AC N-01 / N-02 / N-03）

- ✅ defineFeature 导出正确（feature-css-effects/src/index.ts）
- ✅ 注册在 apps/web/src/features.ts
- ✅ 两条 routes：`''`（CssEffectsPage 分类管理首页）+ `effect/:effectId`（EffectDetailPage 效果详情）
- ✅ 侧边栏不展开动态分类子菜单（分类切换在功能页面内部 tab 完成）

---

## 数据模型一致性

- ✅ 后端 EffectCategory / CssEffect 与前端 types.ts 定义完全对齐
- ✅ batch-move 路由接收 `{ effectIds: string[], targetCategoryId: string | null }`
- ✅ categoryId = null 表示「未分类」
- ✅ 效果类型 EffectType 限定 'css' | 'animation' | 'echarts'

---

## 种子数据（AC S-01 / S-02）

- ✅ 3 个分类：基础 CSS / CSS 动画 / ECharts 可视化
- ✅ 6 个效果：呼吸动画 / 渐变边框按钮 / 卡片悬浮提升 / 加载 Spinner / ECharts 折线图 / ECharts 环形图
- ✅ 覆盖三种 effectType（2 css + 2 animation + 2 echarts）
- ✅ init() 检测文件缺失时自动写入种子（effect-store.ts L73–78）

---

## 边界条件

- ✅ 分类名称重复 → 409 (DuplicateCategoryError)
- ✅ 分类不存在 → 404
- ✅ 字段长度：分类名 1–32 字符、效果名 1–64 字符
- ✅ 查询参数 `categoryId=null` 表示未分类（app.ts L471–473 特殊处理 'null' 和 '' 字符串）
- ✅ listEffects 上限 200 条（effect-store.ts listEffects 末尾 `.slice(0, 200)`）
- ✅ updateEffect 校验目标分类存在性（effect-store.ts L440–441）

---

## 代码质量

- ✅ TypeScript noUncheckedIndexedAccess 修复（两处 `as EffectCategory` / `as CssEffect` 断言）
- ✅ ESLint 无 error（修复 1 处 prefer-const）
- ✅ 功能包内无 `any` 类型（Grep \bany\b → 0 matches）
- ✅ EffectStore 写队列串行（enqueue 方法 Promise 链）+ rename 原子落盘（writeAtomic 临时文件 UUID.tmp → rename）
- ✅ `pnpm check` → 18/18 任务全绿（lint + typecheck + test + build）

---

## 可改进建议（已于 2026-11-20 第二轮全部修复）

| 编号 | 建议                                                                                            | 修复情况                                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **app.ts 代码组织**：CSS effects 路由段位于 `/api/mail/verify` 之后，可整体移到所有 mail 路由后 | ✅ 已修复。排查时发现更严重的问题：`/api/mail/verify` 路由响应代码被截断，后续 CSS 路由被“吞进” verify handler 内部（只有访问过 verify 才会注册）。已恢复 verify 完整实现（`{ ok, message }` 响应），路由分组顺序为 health → auth → accounts → mail → css-effects |
| 2    | **前端 apiFetch / useCurrentUser 重复实现**：CssEffectsPage 和 EffectDetailPage 各自实现        | ✅ 已修复。新增 `packages/feature-css-effects/src/shared.ts`，统一导出 `apiFetch`（带 status 的 Error）、`useCurrentUser`、`tagStyle`、`EFFECT_TYPE_LABEL`、`Toast` 类型；两个页面改为从 shared 导入，删除约 100 行重复代码                                       |
| 3    | **表单校验纯空白兜底**：trim 后仍可传入全空白字符串                                             | ✅ 已修复。后端 `POST/PATCH /api/css-effects/effects` 与 `batch-move` 对 `categoryId` / `targetCategoryId` 做归一：空白字符串 → `null`（未分类），非字符串非 null → 400；`effectIds` 逐项 trim 并过滤空值。分类/效果名称纯空白已由长度校验拒绝（有测试覆盖）      |
| 4    | **缺 Vitest 单测**：EffectStore 与 API 路由无自动化测试                                         | ✅ 已修复。新增 `effect-store.test.ts`（16 个用例：种子数据、重复名、删除分类→效果归未分类、并发写、搜索、批量转移等）与 `css-effects.test.ts`（17 个用例：401/403、409、404、400、删除分类后端到端、batch-move、以及 `/api/mail/verify` 不再挂起的回归测试）     |

验证：`pnpm --filter @repo/server test` → 3 个测试文件、50 个用例全部通过；`pnpm check` 全量通过。

---

## Review History

| 日期       | 审阅人                                | 结论 | 备注                                                                    |
| ---------- | ------------------------------------- | ---- | ----------------------------------------------------------------------- |
| 2026-11-20 | general_purpose_task（独立 Reviewer） | pass | 七大维度 25+ 检查点全过                                                 |
| 2026-11-20 | 第二轮修复（主 agent 自验）           | pass | 4 条建议全部修复；顺带修复 mail/verify 路由截断缺陷；新增 33 个测试用例 |
