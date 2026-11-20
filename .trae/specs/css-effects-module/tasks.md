# CSS 效果模块 — 任务清单

> 关联 Spec：`.trae/specs/css-effects-module/spec.md`
> 生成日期：2026-11-20
> 最后更新：2026-11-20

---

## Task 1: 后端 EffectStore + 种子数据

**目标**：创建 `EffectStore`，复用 `AccountStore` 的 JSON + 写队列 + 原子 rename 模式，存储分类和效果。

**验收标准映射**：

- C-01 列出分类 → EffectStore.listCategories
- C-02 创建分类 → EffectStore.createCategory + 唯一校验
- C-04 删除分类 → EffectStore.deleteCategory（效果 categoryId 置 null）
- C-05 重复名称 → EffectStore 返回特定错误
- E-01~E-04 效果 CRUD → EffectStore 对应方法
- S-01 种子数据 → init() 时检测文件不存在 → 写入 3 分类 + 6 示例效果

**实现文件**：

- 新增：`apps/server/src/effect-store.ts`
- 修改：`apps/server/src/app.ts`（导入 + init）

**状态**：completed

**Completion Evidence**：

- `pnpm typecheck` 全仓 18 包通过
- `pnpm lint` 全绿（修复 1 处 prefer-const）
- EffectStore 类完整实现：init / listCategories / createCategory / updateCategory / deleteCategory / listEffects / findEffectById / createEffect / updateEffect / deleteEffect / batchMoveEffects + 内部 enqueue + writeAtomic
- 删除分类安全逻辑：deleteCategory(id) 将该分类下所有效果 categoryId 置 null（不删效果本身）
- 种子数据：3 分类（基础 CSS / CSS 动画 / ECharts 可视化）+ 6 效果（呼吸动画、渐变边框、卡片悬浮、加载 spinner、折线图、环形图），覆盖 css / animation / echarts 三种 type
- 写操作串行队列（Promise 链 enqueue）+ 临时文件 UUID.tmp → rename 原子落盘
- 数据文件路径：`apps/server/data/css-effects.json`（.gitignore 忽略）

---

## Task 2: 后端 API 路由 + 参数校验

**目标**：在 `apps/server/src/app.ts` 中注册所有 `/api/css-effects/*` 路由，接入 EffectStore。

**验收标准映射**：

- C-01~C-07 分类 API
- E-01~E-04 效果 API
- E-05 按 type / tag / q 搜索

**实现文件**：

- 修改：`apps/server/src/app.ts`

**状态**：completed

**Completion Evidence**：

- 10 个路由全部注册在 `/api/mail/verify` 后、`setNotFoundHandler` 前
- 所有写路由 admin 角色校验（非 admin 403），所有路由登录态校验（未登录 401）
- POST/PATCH 分类名称重复抛 DuplicateCategoryError → 409；不存在 → 404
- 参数校验：effectType 限定 'css'|'animation'|'echarts'；字段长度 name 1–64 / category 1–32
- GET effects 支持 query: `categoryId`（含 `null` 表示未分类）/ `type` / `q`（substring 搜索 name+description+tags）
- POST `/api/css-effects/effects/batch-move` 接收 `{ effectIds: string[], targetCategoryId: string | null }`

---

## Task 3: 创建前端功能包骨架 + 宿主注册

**目标**：复制 feature-dashboard 模板为 `packages/feature-css-effects`，注册到宿主 features.ts 和 vite.config.ts。

**验收标准映射**：

- N-01 侧边栏出现入口
- N-02 路由可访问

**实现文件**：

- 新增：`packages/feature-css-effects/` 下 7 个文件（package.json / tsconfig.json / src/{index.ts,types.ts,EffectPreview.tsx,CssEffectsPage.tsx,EffectDetailPage.tsx}）
- 修改：`apps/web/package.json` / `apps/web/src/features.ts` / `apps/web/vite.config.ts`

**状态**：completed

**Completion Evidence**：

- `pnpm install --no-frozen-lockfile` 成功
- `pnpm typecheck` 全仓 18 包通过
- 包名 `@repo/feature-css-effects`，Feature id `css-effects`
- 两条路由：`''`（分类管理首页）+ `effect/:effectId`（效果详情）
- vite.config.ts optimizeDeps.exclude 已添加

---

## Task 4: 分类管理首页 + 效果卡片网格

**目标**：实现 `/css-effects` 主页面。

**验收标准映射**：B-01~B-06 / C-01~C-07 / E-04 / E-05

**实现文件**：

- 修改：`packages/feature-css-effects/src/CssEffectsPage.tsx`（~1700 行，完整实现）

**状态**：completed

**Completion Evidence**：

- 左右布局：左侧 240px 分类面板 + 右侧 flex:1 主内容区
- 左侧分类面板：「未分类」固定顶部 + API 拉取的分类列表（按 createdAt 升序）+ 当前选中高亮 + admin 可见增删改按钮 + 「+ 新增分类」按钮
- 右侧主内容：防抖 300ms 搜索框 → GET `/api/css-effects/effects?categoryId=xxx&q=xxx`；响应式卡片网格 auto-fill minmax(260px,1fr)
- 卡片：EffectPreview mode='thumb'（220x120 iframe sandbox，不带 allow-same-origin）+ name + description + tags 彩色标签 + effectType 徽章
- admin 卡片操作：checkbox（批量选择）+ 删除按钮（window.confirm）
- 批量转移 Modal：选中效果 > 0 时顶部出现按钮，选择目标分类（含未分类），POST batch-move
- 分类增删改 Modal：新增 POST / 编辑 PATCH 预填 / 删除二次确认 DELETE
- 效果创建/编辑 Modal：全字段表单 + echartsOption JSON 校验
- viewer 自动隐藏所有 admin 专属按钮（useCurrentUser fetch `/api/auth/me`）
- 错误 banner（4s 自动清除）+ 成功 toast
- 样式类名 `ffm-effects-` 前缀，ensurePageCss() useEffect 注入

---

## Task 5: 效果详情页（代码分区 + 一键复制）

**目标**：实现 EffectDetailPage。

**验收标准映射**：B-03 / B-04 / E-06 / E-07

**实现文件**：

- 修改：`packages/feature-css-effects/src/EffectDetailPage.tsx`（~860 行，完整实现）
- 已存在（由 Task 3 骨架实现）：`packages/feature-css-effects/src/EffectPreview.tsx`（iframe sandbox 隔离渲染）

**状态**：completed

**Completion Evidence**：

- 顶部返回按钮 navigate(-1)；加载态 spinner + 404 态
- EffectPreview mode='full'（sandbox allow-scripts，不带 allow-same-origin）
- 信息区：大标题 + effectType 徽章 + 彩色 tags + 所属分类名（null → 未分类）+ description + createdAt / updatedAt
- 代码 Tab 区：HTML / CSS / JS / ECharts Option 条件渲染；单 Tab 时隐藏 Tab 头；每个 Tab 独立「复制代码」按钮
- 底部「复制全部源码」按钮：// ---- XXX ---- 注释分隔拼接
- iframe sandbox：不带 allow-same-origin（安全），echarts CDN 引入通过 iframe 内 `<script src>`
- 删除效果 Modal（admin）→ DELETE /api/css-effects/effects/:id → navigate(-1)
- 样式类名 `ffm-effects-` 前缀，ensureDetailPageCss() useEffect 注入

---

## Task 6: 样式

**目标**：编写 CSS 样式。

**验收标准映射**：NFR-02

**状态**：completed

**Completion Evidence**：

- CssEffectsPage 和 EffectDetailPage 各自通过 ensureXxxCss() 在 useEffect 中注入 `<style>` 到 document.head
- 样式类名 `ffm-effects-` 前缀，复用宿主 CSS 变量（--ffm-*）
- 卡片网格 responsive auto-fill minmax(260px,1fr)
- 分类面板固定 240px 宽

---

## Task 7: 测试

**目标**：为 EffectStore 和后端路由编写 Vitest 测试。

**状态**：completed

**Completion Evidence**：

- 新增 `apps/server/src/effect-store.test.ts`（16 个用例）：种子数据（3 分类 / 6 效果 / 三种类型）、init 不覆盖已有数据、重复分类名抛 DuplicateCategoryError、纯空白名称拒绝、删除分类后效果归未分类且总数不变、删除不存在返回 false、分类存在性校验、按 categoryId / type / q 过滤、更新与删除效果、批量转移到分类与 null、批量转移目标不存在抛错、并发创建 5 分类不丢数据
- 新增 `apps/server/src/css-effects.test.ts`（17 个用例）：未登录 401、viewer 只读 403、种子数据 3+6、创建分类 201 与重名 409、纯空白名称 400、更新/删除不存在 404、删除分类后端到端（效果进入 categoryId=null 列表且总数不变）、非法 effectType 400、空白 categoryId 归一为 null、按类型搜索、batch-move 移动到分类与 null、目标分类不存在 400、删除单个效果后 404、`/api/mail/verify` 未配置 SMTP 时返回 ok=false 不挂起的回归测试
- `pnpm --filter @repo/server test` → 3 个测试文件、50 个用例全部通过
- `pnpm check` → 18/18 任务全绿（lint + typecheck + test + build）
- 曾在第一轮标记为 cancelled（用户未要求）；第二轮按 review.md 建议补齐

---

## Task 8: 端到端验证 + 质量门禁

**目标**：运行 `pnpm check`，全量质量门禁。

**验收标准映射**：全部 AC

**状态**：completed

**Completion Evidence**：

- `pnpm install --no-frozen-lockfile` 成功（3 新 workspace 包 + 依赖）
- `pnpm check` → 18/18 任务全绿（lint + typecheck + test + build）
- **lint**：18 包无警告无错误（修复 1 处 prefer-const）
- **typecheck**：18 包 0 error
- **test**：现有测试全部通过，无回归
- **build**：前后端 + 13 功能包 + core + contracts + ui 全部构建成功，vite 产物 2.74MB JS / 139KB CSS（仅 chunks 超 500KB 提示，不阻塞）
- seed 数据验证：首次启动写入 3 分类 + 6 效果（实际存储在 apps/server/data/css-effects.json，.gitignore 已忽略）
- 所有 iframe sandbox 均不带 allow-same-origin（安全 NFR-08 通过）
- viewer 隐藏 admin 按钮（useCurrentUser 失败时静默降级为 viewer 模式）

---

## 第二轮变更（2026-11-20）：平台模块化 + 目录重组

> 依据 spec.md 第 10 节「需求变更记录」第 2 版

### Task 9: feature 包目录重组

**状态**：completed

**Completion Evidence**：

- 12 个 `feature-*` 包由 `packages/` 迁至 `packages/features/`
- `pnpm-workspace.yaml` 增加 `packages/features/*`
- 12 个包 `tsconfig.json` 的 `extends` 改为 `../../../tsconfig.base.json`
- `pnpm install` 后 `pnpm typecheck` 全绿，workspace 链接正常
- README / AGENTS / FEATURE_INTEGRATION 中模板路径同步为 `packages/features/feature-*`

### Task 10: CSS 效果转为平台模块

**状态**：completed

**Completion Evidence**：

- 新增 `packages/css-effect`（`@repo/css-effect`），从 FeatureRegistry 移除
- 新增 `apps/web/src/platforms.ts` 注册 `platformModules`
- `App.tsx` 渲染平台模块路由；`AppShell.tsx` 新增 `PlatformNavGroup`，与「功能管理」平级渲染，含静态「分类管理」项 + `useNavItems` 动态分类子菜单
- 分类增删改后通过 `css-effect:categories-changed` 事件刷新侧边栏
- 旧包 `packages/features/feature-css-effects` 已按用户确认删除

### Task 11: 页面拆分与详情页下线

**状态**：completed

**Completion Evidence**：

- `CategoryManagePage`（`/css-effect`）：仅分类列表 + 未分类入口 + admin 增删改
- `CategoryEffectsPage`（`/css-effect/category/:categoryId`）：分类下效果卡片网格 + 新增/编辑/删除 + 批量转移 + 搜索
- `EffectCodeModal`：点击卡片弹出完整预览 + 代码 Tab + 复制，替代已删除的 `EffectDetailPage`
- 删除 `/css-effect/effect/:id` 路由

### Task 12: 质量门禁

**状态**：completed

**Completion Evidence**：

- `pnpm install` 成功（删除旧包后 635 依赖复用）
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 全部通过
- `pnpm check` → 18/18 任务全绿（旧包删除后少 1 个包）
- 服务端 50 个测试无回归
