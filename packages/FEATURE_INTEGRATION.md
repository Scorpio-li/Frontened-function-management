# 功能接入文档

> 每次新增或接入功能模块前，必须先完整阅读本文档，再按对应类型选择接入方式。

## 1. 结论先行

| 项目类型           | 能否接入 | 推荐方式                                                                    |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| React              | ✅ 原生  | 新建 `@repo/feature-<id>` 功能包，直接注册路由                              |
| ECharts            | ✅ 原生  | 在 React 功能包内引入 `echarts`                                             |
| HTML / CSS / JS    | ✅ 支持  | 静态产物放入 `apps/web/public/legacy/<id>/`，用 React 功能包包一层 iframe   |
| Vue                | ✅ 支持  | Vue 构建为静态产物后用 iframe 嵌入，或编译为 Custom Element 在 React 中渲染 |
| Node（仅后端服务） | ✅ 支持  | 独立进程/端口运行，平台通过代理或 iframe 页面接入，不参与宿主打包           |

**平台本身只直接编译 React 组件**：功能契约中的 `routes[].element` 是 React 组件，因此 React 项目可以「源码级」接入；其他技术栈需要先产出可访问的页面或服务，再通过 iframe / 静态资源 / 反向代理的方式接入。

## 2. 平台机制

- 宿主：`apps/web`，Vite + React Router，负责登录、导航、路由挂载与功能启停。
- 功能包：`packages/feature-*`，用 `defineFeature` 声明，导出一个 `Feature` 对象：

```ts
import { defineFeature } from '@repo/core';

export const demoFeature = defineFeature({
  id: 'demo', // 全局唯一，最终路径前缀为 /demo
  name: '示例功能',
  description: '面向用户的描述',
  version: '0.1.0',
  // 在功能页面底部自动展示，供其他项目复用同样能力
  implementationSteps: [
    '复制功能包模板并修改包名与功能 id',
    '在 apps/web/src/features.ts 中注册功能',
    '运行 pnpm check 验证接入结果',
  ],
  setup({ eventBus }) {
    // 启动时执行一次，可注册事件监听
  },
  routes: [
    { path: '', label: '首页', element: DemoHomePage },
    { path: 'settings', label: '设置', element: DemoSettingsPage },
  ],
});
```

- 路由地址：`/<featureId>/<path>`，空 `path` 表示该功能首页。
- 导航：所有已启用功能会出现在侧边栏「功能管理」分组下；多路由功能显示功能名作为二级标题。
- 权限：所有已登录用户（admin / viewer）都可访问功能页面；功能内部如需写操作，必须自行按角色做限制。
- 启停：管理员可在「功能管理 → 功能配置」停用功能，停用后路由与导航同时移除。

## 3. React 项目接入（推荐）

1. 复制 `packages/feature-dashboard` 为 `packages/feature-<id>`，修改 `package.json` 包名为 `@repo/feature-<id>`。
2. 在 `src/index.ts` 中用 `defineFeature` 导出功能对象。
3. 页面组件、样式、状态都放在该包内；不要导入 `apps/web` 或其他 `feature-*` 包。
4. 在 `apps/web/package.json` 增加 `"@repo/feature-<id>": "workspace:*"`。
5. 在 `apps/web/src/features.ts` 中导入并加入 `new FeatureRegistry([...])`。
6. 执行 `pnpm install`，然后运行 `pnpm check`。

约束：

- 包名必须是 `@repo/feature-<id>`，`id` 不得重复。
- 跨功能通信用 `@repo/core` 的 `EventBus`，不要直接引用其他功能包。
- 不写全局 CSS；需要局部样式时使用独立前缀，避免污染宿主。

## 4. HTML / CSS / JS 静态项目

适用于纯静态页面、原生 JS 小工具、旧项目迁移。

**方式 A：静态资源 + iframe（推荐）**

1. 将构建产物放到 `apps/web/public/legacy/<id>/`，例如 `apps/web/public/legacy/old-tool/index.html`。
2. 新建一个 React 功能包，在页面中用 iframe 指向 `/legacy/<id>/index.html`：

```tsx
export function LegacyToolPage() {
  return (
    <iframe
      className="legacy-frame"
      src="/legacy/old-tool/index.html"
      title="旧版工具"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
```

3. 用 `defineFeature` 把该页面注册为功能路由。

**方式 B：独立部署 + iframe / 新窗口**

静态项目部署在独立域名或端口时，功能包只负责入口页面，iframe 或 `window.open` 打开目标地址。注意目标站点是否允许被嵌入（见第 8 节）。

## 5. Vue 项目

平台不直接编译 `.vue` 文件，需要先构建为浏览器可运行的产物。

**方式 A：构建静态产物 + iframe（最稳妥）**

1. Vue 项目单独构建（Vite 配置 `base: '/legacy/<id>/'`）。
2. 产物放到 `apps/web/public/legacy/<id>/` 或独立部署。
3. 在 React 功能包中用 iframe 加载入口 HTML。

**方式 B：Vue Custom Element（适合小型组件）**

用 `defineCustomElement` 将 Vue 组件编译为 Web Component，在 React 中通过 ref 挂载：

```ts
import { defineCustomElement } from 'vue';
import DemoElement from './Demo.ce.vue';

customElements.define('demo-element', defineCustomElement(DemoElement));
```

```tsx
export function VueWidgetPage() {
  return <demo-element />;
}
```

注意：需要为 JSX 补充自定义元素类型声明；Vue 与 React 同时存在会增加包体积，复杂项目优先用 iframe。

**Vue Router 注意**：使用 hash 路由（`createWebHashHistory`）可避免与宿主 History 路由冲突；使用 history 路由时必须配置子路径 `base`。

## 6. ECharts

推荐直接在 React 功能包内使用：

```bash
pnpm --filter @repo/feature-<id> add echarts
```

图表容器需要固定高度，组件卸载时调用 `dispose` 释放实例。已有 ECharts 页面也可以按 HTML/Vue 的方式用 iframe 接入。

## 7. Node 项目

Node 项目通常是后端服务，不是前端页面，接入方式与前端不同：

- **独立服务**：Node 服务单独启动（如 3002 端口），平台不负责打包与部署。
- **开发环境**：在 `apps/web/vite.config.ts` 的 `server.proxy` 增加代理规则，例如 `/api/tools` → `http://localhost:3002`。
- **页面接入**：如果 Node 同时提供页面，可按「独立部署 + iframe」接入；只提供 API 时，由 React 功能包调用接口并渲染界面。
- **生产环境**：由反向代理（Nginx 等）统一域名与路径，避免跨域。

注意：平台的登录会话是 Cookie `ffm_session`，跨域服务默认拿不到；需要在服务端校验平台会话或使用独立的服务鉴权。

## 8. iframe 嵌入规范

- **同源优先**：放在 `apps/web/public/` 下的静态资源与宿主同源，Cookie、相对路径都最省事。
- **跨域限制**：目标站点若设置了 `X-Frame-Options: DENY/SAMEORIGIN` 或 `CSP frame-ancestors`，将无法被嵌入；此时改用新窗口打开。
- **登录态**：跨域 iframe 属于第三方上下文，`SameSite=Lax` 的 Cookie 不会随请求发送；需要目标服务自行鉴权，或改为同源部署。
- **通信**：使用 `postMessage`，并校验 `event.origin`：

```ts
// 宿主 → iframe
iframeRef.current?.contentWindow?.postMessage({ type: 'ffm:user', userId }, targetOrigin);

// iframe → 宿主
window.parent.postMessage({ type: 'tool:ready' }, targetOrigin);
```

- **尺寸**：iframe 需要显式高度（如 `height: calc(100vh - 120px)`），否则会出现 0 高度。
- **安全**：默认加 `sandbox`，按需放开 `allow-scripts`、`allow-same-origin`、`allow-forms`。

## 9. 登录态与权限

- 前端页面由宿主 `RequireAuth` 保护，未登录无法进入功能路由。
- 功能内部的写操作（新增、删除等）需要按 `user.role` 自行限制，平台不做细粒度权限。
- 跨域 iframe / 独立 Node 服务无法自动继承平台登录态，需自行处理鉴权，或改为同源接入。

## 10. 接入检查清单

- [ ] 已确认项目类型与接入方式（React / iframe / 静态资源 / 独立服务）
- [ ] 功能包命名符合 `@repo/feature-<id>`，`id` 唯一
- [ ] 已在 `apps/web/src/features.ts` 注册，并在侧边栏可见
- [ ] 停用功能后导航与路由均消失，重新启用后恢复
- [ ] 页面在 viewer 账号下访问正常，写操作有角色限制
- [ ] 没有导入 `apps/web` 或其他 `feature-*` 包
- [ ] 没有全局 CSS 污染，样式使用独立前缀
- [ ] iframe 场景已验证同源/跨域、登录态与高度显示
- [ ] 已在 `defineFeature` 中填写 `implementationSteps`，功能页面底部可见「实现步骤」
- [ ] 已运行 `pnpm check`（lint / typecheck / test / build）

## 11. 常见问题

| 现象                  | 排查                                                              |
| --------------------- | ----------------------------------------------------------------- |
| 功能页面 404          | 检查是否已注册、`id` 是否拼写正确、功能是否被停用                 |
| iframe 空白           | 目标站点是否禁止嵌入、路径是否正确、是否设置了固定高度            |
| iframe 内接口 401     | 跨域未携带 `ffm_session`，改为同源部署或独立鉴权                  |
| Vue 组件样式污染宿主  | 使用 scoped 样式或 Shadow DOM（Custom Element），不要写全局选择器 |
| Node 服务接口跨域失败 | 开发环境配置 Vite 代理，生产环境用反向代理统一域名                |
| 打包体积过大          | 避免在 React 包中同时引入 Vue/ECharts 全量包，优先 iframe 隔离    |

## 12. 功能实现步骤（强制）

每个功能都必须在 `defineFeature` 中提供 `implementationSteps`：

```ts
export const demoFeature = defineFeature({
  id: 'demo',
  name: '示例功能',
  implementationSteps: [
    {
      text: '在功能包中安装依赖',
      code: 'pnpm add <library>',
    },
    {
      text: '在页面中初始化并渲染组件',
      code: `const instance = new DemoLibrary(container);
instance.render();`,
    },
    { text: '在 apps/web/src/features.ts 注册功能' },
    { text: '运行 pnpm check 验证', code: 'pnpm check' },
  ],
  routes: [{ path: '', label: '示例', element: DemoPage }],
});
```

- 宿主会在对应功能页面下方自动渲染这些步骤，标题为「实现步骤」。
- 每个步骤包含 `text` 必填说明，相关代码实现放在可选的 `code` 字段中，会以代码块展示。
- 步骤应写成「其他项目接入同样能力」的可执行动作，包含依赖安装、初始化方式、注册与验证。
- 新增功能未填写 `implementationSteps` 时，代码评审不应通过。
- 接入方式为 iframe / 独立服务时，步骤中需说明静态资源放置位置、代理配置或部署要求。
