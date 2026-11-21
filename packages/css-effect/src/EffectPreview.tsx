import { useEffect, useMemo, useRef, useState } from 'react';

import type { CssEffect } from './types';

interface EffectPreviewProps {
  effect: CssEffect;
  mode?: 'thumb' | 'full';
}

/** 转义 HTML 属性值，避免 CDN 地址里的引号破坏结构。 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isStylesheetUrl(url: string): boolean {
  return /\.css(?:[?#].*)?$/i.test(url);
}

/** 把一条 CDN 配置转成样式标签；支持直接粘贴 <link> 标签。 */
function toStyleTag(entry: string): string {
  if (/^<link\b/i.test(entry)) return entry;
  return `<link rel="stylesheet" href="${escapeAttr(entry)}" />`;
}

/** 把一条 CDN 配置转成脚本标签；支持直接粘贴 <script> 标签。 */
function toScriptTag(entry: string): string {
  if (/^<script\b/i.test(entry)) return entry;
  return `<script src="${escapeAttr(entry)}"></script>`;
}

/**
 * 将效果代码组装成一段可直接塞进 iframe srcdoc 的 HTML 字符串。
 * thumb 模式只渲染静态 html + css，不执行任何脚本。
 * full 模式允许执行 js 字段，并在 echarts 类型下引入 ECharts CDN。
 */
function buildSrcdoc(effect: CssEffect, mode: 'thumb' | 'full'): string {
  const { html = '', css = '', js, echartsOption, effectType } = effect;

  const isFull = mode === 'full';
  const needsEcharts = effectType === 'echarts';

  const cdnUrls = Array.isArray(effect.cdnUrls) ? effect.cdnUrls : [];
  // .css 链接或 <link> 标签作为样式引入；其余作为脚本，缩略图模式不加载脚本
  const cdnStyles = cdnUrls
    .filter((entry) => /^<link\b/i.test(entry) || isStylesheetUrl(entry))
    .map(toStyleTag)
    .join('\n');
  const cdnScripts = isFull
    ? cdnUrls
        .filter((entry) => !/^<link\b/i.test(entry) && !isStylesheetUrl(entry))
        .map(toScriptTag)
        .join('\n')
    : '';

  const styles = `
    <style>
      html, body {
        margin: 0;
        padding: 8px;
        width: 100%;
        height: 100%;
        overflow: auto;
        background: #ffffff;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      *, *::before, *::after { box-sizing: border-box; }
      .ffm-preview-error {
        color: #d32f2f;
        background: #ffebee;
        border: 1px solid #ffcdd2;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: pre-wrap;
        word-break: break-all;
      }
      ${css}
    </style>
  `;

  const echartsContainer = needsEcharts
    ? `<div id="echarts-container" style="width:100%;height:100%;min-height:160px;"></div>`
    : '';

  const scripts: string[] = [];

  if (isFull && needsEcharts) {
    scripts.push(`
      <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
    `);
  }

  if (isFull) {
    scripts.push(`
      <script>
        window.addEventListener('error', function (event) {
          var msg = (event && event.message) || 'Unknown error';
          var el = document.getElementById('__ffm_error__');
          if (!el) {
            el = document.createElement('div');
            el.id = '__ffm_error__';
            el.className = 'ffm-preview-error';
            document.body.appendChild(el);
          }
          el.textContent = msg;
        });
      </script>
    `);

    const initCode = needsEcharts
      ? `
          var container = document.getElementById('echarts-container');
          if (container && typeof echarts !== 'undefined') {
            var inst = echarts.init(container);
            var option = ${JSON.stringify(echartsOption ?? null)};
            if (option) inst.setOption(option);
          }
        `
      : '';

    scripts.push(`
      <script>
        document.addEventListener('DOMContentLoaded', function () {
          ${initCode}
          ${js ? `try { ${js} } catch (e) { console.error(e); }` : ''}
        });
      </script>
    `);
  }

  return `<!doctype html><html><head><meta charset="utf-8" />${cdnStyles}${styles}</head><body>${html}${echartsContainer}${cdnScripts}${scripts.join('')}</body></html>`;
}

export function EffectPreview({ effect, mode = 'thumb' }: EffectPreviewProps) {
  const isFull = mode === 'full';
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const srcdoc = useMemo(() => buildSrcdoc(effect, mode), [effect, mode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // 每次 srcdoc 变化时清空错误状态
    setError(null);
  }, [srcdoc]);

  const width = isFull ? '100%' : 220;
  const height = isFull ? 360 : 120;

  const sandbox = isFull ? 'allow-scripts' : '';

  return (
    <div
      style={{
        position: 'relative',
        width: typeof width === 'number' ? `${width}px` : width,
        height: `${height}px`,
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox={sandbox}
        title={`${effect.name}-preview`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        onError={() => setError('iframe 加载失败')}
      />
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffebee',
            color: '#d32f2f',
            fontSize: 12,
            padding: 8,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
