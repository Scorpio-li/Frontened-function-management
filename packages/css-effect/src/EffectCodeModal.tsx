import { useEffect, useMemo, useRef, useState } from 'react';

import { CSS_EFFECTS_PAGE_CSS } from './CategoryManagePage';
import { EffectPreview } from './EffectPreview';
import { EFFECT_TYPE_LABEL, formatDate, tagStyle } from './shared';
import type { CssEffect } from './types';

const CSS_STYLE_ATTR = 'data-ffm-effects-page';

/** 注入共享样式；已存在则跳过，避免重复插入。 */
function ensureCss(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[${CSS_STYLE_ATTR}]`)) return;
  const style = document.createElement('style');
  style.textContent = CSS_EFFECTS_PAGE_CSS;
  style.setAttribute(CSS_STYLE_ATTR, '');
  document.head.appendChild(style);
}

/** 写入剪贴板，非安全上下文时退化为 textarea + execCommand。 */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('复制失败');
}

interface CodeTab {
  key: string;
  label: string;
  body: string;
}

interface EffectCodeModalProps {
  effect: CssEffect;
  onClose: () => void;
}

/**
 * 效果代码查看弹窗：完整预览 + HTML / CSS / JS / ECharts Option 代码分区 + 复制。
 * 字段不存在时隐藏对应 Tab，仅有一个 Tab 时隐藏 Tab 头。
 */
export function EffectCodeModal({ effect, onClose }: EffectCodeModalProps) {
  const [activeKey, setActiveKey] = useState('');
  const [copyState, setCopyState] = useState<{ key: string; ok: boolean } | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    ensureCss();
  }, []);

  // ESC 关闭
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 卸载时清理复制提示定时器
  useEffect(
    () => () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const tabs = useMemo<CodeTab[]>(() => {
    const list: CodeTab[] = [];
    if (effect.html) list.push({ key: 'html', label: 'HTML', body: effect.html });
    if (effect.css) list.push({ key: 'css', label: 'CSS', body: effect.css });
    if (effect.js) list.push({ key: 'js', label: 'JS', body: effect.js });
    if (
      effect.effectType === 'echarts' &&
      effect.echartsOption !== undefined &&
      effect.echartsOption !== null
    ) {
      list.push({
        key: 'echarts',
        label: 'ECharts Option',
        body: JSON.stringify(effect.echartsOption, null, 2),
      });
    }
    return list;
  }, [effect]);

  // effect 变化后，把当前 Tab 修正为第一个可用 Tab
  useEffect(() => {
    setActiveKey((current) =>
      tabs.some((tab) => tab.key === current) ? current : (tabs[0]?.key ?? ''),
    );
  }, [tabs]);

  const currentTab = useMemo(
    () => tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null,
    [tabs, activeKey],
  );

  const fullSource = useMemo(() => {
    const parts: string[] = [];
    if (effect.html) parts.push(`/* ---- HTML ---- */\n${effect.html}`);
    if (effect.css) parts.push(`/* ---- CSS ---- */\n${effect.css}`);
    if (effect.js) parts.push(`/* ---- JS ---- */\n${effect.js}`);
    if (
      effect.effectType === 'echarts' &&
      effect.echartsOption !== undefined &&
      effect.echartsOption !== null
    ) {
      parts.push(
        `/* ---- ECharts Option ---- */\n${JSON.stringify(effect.echartsOption, null, 2)}`,
      );
    }
    return parts.join('\n\n');
  }, [effect]);

  async function handleCopy(text: string, key: string) {
    let ok = true;
    try {
      await writeClipboard(text);
    } catch {
      ok = false;
    }
    setCopyState({ key, ok });
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), 1500);
  }

  function copyLabel(key: string, defaultLabel: string): string {
    if (copyState?.key !== key) return defaultLabel;
    return copyState.ok ? '已复制' : '复制失败';
  }

  const typeMeta = EFFECT_TYPE_LABEL[effect.effectType];

  return (
    <div className="ffm-effects-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="ffm-effects-modal ffm-effects-modal--code"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${effect.name} 代码`}
      >
        <div className="ffm-effects-modal__header">
          <h3>{effect.name}</h3>
          <button
            type="button"
            className="ffm-effects-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="ffm-effects-modal__body">
          <div className="ffm-effects-code-modal__meta">
            <span
              className="ffm-effects-badge"
              style={{ backgroundColor: typeMeta.bg, color: typeMeta.text }}
            >
              {typeMeta.label}
            </span>
            {effect.tags.map((tag) => {
              const style = tagStyle(tag);
              return (
                <span
                  key={tag}
                  className="ffm-effects-tag"
                  style={{ backgroundColor: style.backgroundColor, color: style.color }}
                >
                  {tag}
                </span>
              );
            })}
            <span>更新于 {formatDate(effect.updatedAt)}</span>
          </div>

          <div className="ffm-effects-code-modal__preview">
            <EffectPreview effect={effect} mode="full" />
          </div>

          {currentTab ? (
            <div className="ffm-effects-code-section">
              <div className="ffm-effects-code-header">
                {tabs.length > 1 ? (
                  <div className="ffm-effects-tabs" role="tablist">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={currentTab.key === tab.key}
                        className={`ffm-effects-tab${currentTab.key === tab.key ? ' ffm-effects-tab--active' : ''}`}
                        onClick={() => setActiveKey(tab.key)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <h4 className="ffm-effects-code-header__title">{currentTab.label}</h4>
                )}

                <button
                  type="button"
                  className="ffm-effects-btn ffm-effects-btn--ghost"
                  onClick={() => void handleCopy(currentTab.body, currentTab.key)}
                >
                  {copyLabel(currentTab.key, '复制代码')}
                </button>
              </div>

              <pre className="ffm-effects-code-wrap__body">
                <code>{currentTab.body}</code>
              </pre>
            </div>
          ) : (
            <div className="ffm-effects-empty">
              <p className="ffm-effects-empty__title">该效果暂无可查看的源码</p>
            </div>
          )}
        </div>

        <div className="ffm-effects-modal__footer">
          <button
            type="button"
            className="ffm-effects-btn ffm-effects-btn--ghost"
            onClick={onClose}
          >
            关闭
          </button>
          {fullSource && (
            <button
              type="button"
              className="ffm-effects-btn ffm-effects-btn--primary"
              onClick={() => void handleCopy(fullSource, 'all')}
            >
              {copyLabel('all', '复制全部源码')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
