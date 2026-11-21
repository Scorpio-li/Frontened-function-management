/**
 * Cloudflare Workers Static Assets：把 /api/* 反向代理到独立部署的 FFM 后端。
 *
 * 为什么必须写 Worker 脚本：
 *   Workers 的 _redirects 官方文档明确写着「Proxying will only support
 *   relative URLs on your site. You cannot proxy external domains.」——
 *   只有传统 Cloudflare Pages 才能用 `/api/* https://... 200` 代理外部域名。
 *   本项目是 Workers Builds，因此只能让 Worker 对 /api/* 先执行并 fetch 转发。
 *
 * 为什么用同源反代而不是让前端直连后端：
 *   apps/web/src/api/client.ts 写死 API_BASE = '/api' 且 credentials = 'same-origin'，
 *   后端会话 Cookie 是 HttpOnly + SameSite=Lax。浏览器只看到前端域名，Cookie 视为
 *   同站，无需 CORS、无需改前端代码、也不会踩第三方 Cookie 被浏览器拦截的坑。
 *
 * 配置：wrangler.toml 里 main / [assets] binding / run_worker_first，
 *       并在 Cloudflare 项目变量中设置 API_ORIGIN（后端 HTTPS 域名，不带路径）。
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 非 API 请求交给静态资源；未命中资源时由 not_found_handling 回退到 index.html。
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const origin = env.API_ORIGIN;
    if (!origin) {
      return json(
        503,
        'INTERNAL_ERROR',
        'API_ORIGIN 未配置：请在 Cloudflare 项目变量中填写后端 HTTPS 域名',
      );
    }

    let upstreamUrl;
    try {
      // API_ORIGIN 应为纯 origin（如 https://api.<你的域名>，api.example.com 是占位示例），不要带路径或末尾斜杠。
      upstreamUrl = new URL(url.pathname + url.search, origin);
    } catch {
      return json(500, 'INTERNAL_ERROR', 'API_ORIGIN 不是合法 URL');
    }

    // 防止误把前端域名填进 API_ORIGIN 造成请求自循环。
    if (upstreamUrl.host === url.host) {
      return json(502, 'INTERNAL_ERROR', 'API_ORIGIN 不能指向本站点自身');
    }

    const headers = new Headers(request.headers);
    headers.delete('host'); // 由 fetch 按目标 origin 重新设置

    // ngrok 免费版对「HTML 浏览器流量」显示警告页（ERR_NGROK_6024）。官方说明 API /
    // 程序化访问不受影响，但本 Worker 会原样透传浏览器的 User-Agent 与 Accept，
    // 保险起见注入官方支持的跳过头；对其他上游（Vercel / Caddy / Tunnel）此头无害，会被忽略。
    headers.set('ngrok-skip-browser-warning', '1');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual', // 上游 3xx 原样返回给浏览器，不自动跟随
    };
    // GET / HEAD 没有 body，Workers 中 request.body 为 null。
    // duplex: 'half' 是标准 Fetch 的 RequestInit 属性：Workers 会忽略它，
    // 但 Node / undici 环境要求带 stream body 时显式声明，加上后本地也能直接测试。
    if (request.body) {
      init.body = request.body;
      init.duplex = 'half';
    }

    let response;
    try {
      response = await fetch(new Request(upstreamUrl.toString(), init));
    } catch (error) {
      return json(
        502,
        'INTERNAL_ERROR',
        `无法连接后端：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 直接返回上游响应，确保登录会话的 Set-Cookie 与图片二进制原样透传。
    // 不要重建 Response 去加 CORS 头：同源请求不需要，且可能丢失多条 Set-Cookie。
    return response;
  },
};

function json(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
