import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { EffectCategory } from './types';
import { UNCATEGORIZED_NAME, toCategoryIdParam } from './types';
import type { Toast } from './shared';
import {
  apiFetch,
  formatDate,
  notifyCategoriesChanged,
  useCategories,
  useCurrentUser,
} from './shared';

// ---------------------------------------------------------------------------
// 共享样式：分类管理页 / 分类效果页 / 代码查看弹窗共用同一份 CSS，
// 通过 <style data-ffm-effects-page> 标记保证只注入一次。
// 类名统一 ffm-effects- 前缀。
// ---------------------------------------------------------------------------

export const CSS_EFFECTS_PAGE_CSS = `
/* ===== 页面骨架 ===== */
.ffm-effects-page {
  min-height: 100%;
  padding: 20px 24px 48px;
  box-sizing: border-box;
  background: #fafbfc;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, "Noto Sans SC", sans-serif;
}
.ffm-effects-main__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.ffm-effects-main__title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #111827;
}
.ffm-effects-main__title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}
.ffm-effects-main__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ===== 返回链接 ===== */
.ffm-effects-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #4b5563;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 10px;
  margin: 0 0 10px -4px;
  border-radius: 6px;
  transition: background-color .15s, color .15s;
}
.ffm-effects-back:hover { background: #f3f4f6; color: #111827; }

/* ===== 按钮 ===== */
.ffm-effects-btn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #1f2937;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s, border-color .15s;
  font-family: inherit;
}
.ffm-effects-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
}
.ffm-effects-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ffm-effects-btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}
.ffm-effects-btn--primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}
.ffm-effects-btn--ghost { background: transparent; border-color: transparent; }
.ffm-effects-btn--ghost:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: transparent;
}
.ffm-effects-btn--danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.ffm-effects-btn--danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

/* ===== 图标按钮 ===== */
.ffm-effects-icon-btn {
  background: transparent;
  border: none;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  line-height: 1;
  font-family: inherit;
}
.ffm-effects-icon-btn:hover { background: #e5e7eb; color: #111827; }
.ffm-effects-icon-btn--danger:hover { background: #fee2e2; color: #dc2626; }

/* ===== 输入框 ===== */
.ffm-effects-input {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  background: #ffffff;
  color: #1f2937;
  width: 100%;
  box-sizing: border-box;
  transition: border-color .15s, box-shadow .15s;
  resize: vertical;
}
.ffm-effects-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.ffm-effects-input--search { min-width: 240px; }
.ffm-effects-input--code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

/* ===== 错误条 ===== */
.ffm-effects-error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 14px;
}

/* ===== 批量选择条 ===== */
.ffm-effects-batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 14px;
}
.ffm-effects-batch-bar button {
  background: transparent;
  border: none;
  color: #1d4ed8;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}

/* ===== 分类卡片网格 ===== */
.ffm-effects-cat-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.ffm-effects-category-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: box-shadow .15s, border-color .15s, transform .15s;
}
.ffm-effects-category-card:hover {
  box-shadow: 0 4px 14px rgba(17, 24, 39, 0.08);
  border-color: #d1d5db;
  transform: translateY(-1px);
}
.ffm-effects-category-card:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
.ffm-effects-category-card--fixed { background: #fbfcfe; }
.ffm-effects-category-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ffm-effects-category-card__name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ffm-effects-category-card__desc {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
  min-height: 18px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ffm-effects-category-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  font-size: 11px;
  color: #9ca3af;
}
.ffm-effects-category-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ffm-effects-category-card__actions .ffm-effects-btn {
  padding: 2px 8px;
  font-size: 12px;
}

/* ===== 效果卡片网格 ===== */
.ffm-effects-grid { margin-top: 4px; }
.ffm-effects-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  position: relative;
  transition: box-shadow .15s, border-color .15s, transform .15s;
  display: flex;
  flex-direction: column;
}
.ffm-effects-card:hover {
  box-shadow: 0 4px 14px rgba(17, 24, 39, 0.08);
  border-color: #d1d5db;
  transform: translateY(-1px);
}
.ffm-effects-card--selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.18);
}
.ffm-effects-card__corner {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 6px;
  padding: 2px 4px;
  backdrop-filter: blur(2px);
}
.ffm-effects-card__preview {
  display: flex;
  justify-content: center;
  padding: 4px 0 10px;
  cursor: pointer;
}
.ffm-effects-card__body {
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.ffm-effects-card__title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.ffm-effects-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ffm-effects-card__desc {
  font-size: 12px;
  color: #6b7280;
  margin: 4px 0 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ffm-effects-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.ffm-effects-card__footer {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  justify-content: flex-end;
}
.ffm-effects-card__footer .ffm-effects-btn {
  padding: 4px 10px;
  font-size: 12px;
}

/* ===== Tag / Badge ===== */
.ffm-effects-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 500;
}
.ffm-effects-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

/* ===== Checkbox ===== */
.ffm-effects-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.ffm-effects-checkbox input { display: none; }
.ffm-effects-checkbox__indicator {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  display: inline-block;
  position: relative;
  background: #ffffff;
  transition: background-color .15s, border-color .15s;
}
.ffm-effects-checkbox input:checked + .ffm-effects-checkbox__indicator {
  background: #2563eb;
  border-color: #2563eb;
}
.ffm-effects-checkbox input:checked + .ffm-effects-checkbox__indicator::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* ===== 空状态 ===== */
.ffm-effects-empty {
  text-align: center;
  padding: 60px 20px;
  color: #6b7280;
}
.ffm-effects-empty__title {
  font-size: 16px;
  font-weight: 500;
  color: #374151;
  margin: 0 0 10px;
}
.ffm-effects-empty__sub {
  font-size: 13px;
  color: #9ca3af;
  margin: 8px 0 0;
}

/* ===== Modal ===== */
.ffm-effects-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 24px;
}
.ffm-effects-modal {
  background: #ffffff;
  border-radius: 10px;
  width: 440px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 48px rgba(17, 24, 39, 0.25);
}
.ffm-effects-modal--wide { width: 620px; }
.ffm-effects-modal--code { width: 900px; }
.ffm-effects-modal__header {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ffm-effects-modal__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ffm-effects-modal__close {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 16px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.ffm-effects-modal__close:hover { background: #f3f4f6; color: #111827; }
.ffm-effects-modal__body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  font-size: 14px;
  color: #374151;
}
.ffm-effects-modal__footer {
  padding: 12px 20px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* ===== 表单 ===== */
.ffm-effects-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ffm-effects-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
}
.ffm-effects-field__label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}
.ffm-effects-form-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-top: 10px;
}

/* ===== 代码区 ===== */
.ffm-effects-code-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
}
.ffm-effects-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  min-height: 44px;
}
.ffm-effects-code-header__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.ffm-effects-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
}
.ffm-effects-tab {
  border: none;
  background: transparent;
  padding: 10px 14px;
  font-size: 13px;
  font-family: inherit;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color .15s, border-color .15s;
  white-space: nowrap;
}
.ffm-effects-tab:hover { color: #374151; }
.ffm-effects-tab--active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
  font-weight: 600;
}
.ffm-effects-code-wrap__body {
  max-height: 360px;
  overflow: auto;
  padding: 14px 16px;
  margin: 0;
  background: #ffffff;
}
.ffm-effects-code-wrap__body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: #1f2937;
  white-space: pre;
  word-break: normal;
}

/* ===== 代码弹窗 ===== */
.ffm-effects-code-modal__preview { margin-bottom: 16px; }
.ffm-effects-code-modal__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 12px;
  color: #6b7280;
}

/* ===== 图片素材 ===== */
.ffm-effects-assets {
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #fbfcfe;
}
.ffm-effects-assets__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.ffm-effects-assets__hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
}
.ffm-effects-assets__upload {
  flex-shrink: 0;
  border: 1px solid #d1d5db;
  white-space: nowrap;
  cursor: pointer;
}
.ffm-effects-assets__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.ffm-effects-assets__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.ffm-effects-assets__thumb {
  width: 100%;
  height: 88px;
  object-fit: contain;
  border-radius: 6px;
  background: #f9fafb;
}
.ffm-effects-assets__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #9ca3af;
}
.ffm-effects-assets__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ffm-effects-assets__actions {
  display: flex;
  gap: 4px;
}
.ffm-effects-assets__actions .ffm-effects-btn {
  flex: 1;
  padding: 3px 8px;
  font-size: 12px;
}
.ffm-effects-assets__empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

/* ===== 运行预览 ===== */
.ffm-effects-run {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  margin-top: 14px;
}
.ffm-effects-run__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.ffm-effects-run__body { padding: 12px; }
.ffm-effects-run__hint {
  margin: 0;
  padding: 24px 12px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  line-height: 1.6;
}

/* ===== Toast ===== */
.ffm-effects-toast-stack {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ffm-effects-toast {
  background: #111827;
  color: #ffffff;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  box-shadow: 0 6px 18px rgba(17, 24, 39, 0.25);
  min-width: 180px;
  max-width: 360px;
}
.ffm-effects-toast--error { background: #b91c1c; }
`;

const CSS_STYLE_ATTR = 'data-ffm-effects-page';

/** 注入共享样式；已存在则跳过，避免重复插入。 */
function ensureEffectsCss(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[${CSS_STYLE_ATTR}]`)) return;
  const style = document.createElement('style');
  style.textContent = CSS_EFFECTS_PAGE_CSS;
  style.setAttribute(CSS_STYLE_ATTR, '');
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 主页面：分类列表（不展示效果卡片）
// ---------------------------------------------------------------------------

type CategoryModalState =
  | { mode: 'create' }
  | { mode: 'edit'; category: EffectCategory }
  | { mode: 'delete'; category: EffectCategory };

let toastSeed = 0;

export function CategoryManagePage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'admin';
  const { categories, loading } = useCategories();

  const [modal, setModal] = useState<CategoryModalState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    ensureEffectsCss();
  }, []);

  const pushToast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    toastSeed += 1;
    const id = toastSeed;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  /** 保存分类：成功时关闭 Modal 并广播变更；失败抛出，由 Modal 内联展示。 */
  async function handleSaveCategory(value: { name: string; description?: string }) {
    if (modal?.mode === 'edit') {
      await apiFetch<EffectCategory>(`/api/css-effects/categories/${modal.category.id}`, {
        method: 'PATCH',
        body: JSON.stringify(value),
      });
      pushToast('分类已更新');
    } else {
      await apiFetch<EffectCategory>('/api/css-effects/categories', {
        method: 'POST',
        body: JSON.stringify(value),
      });
      pushToast('分类已创建');
    }
    setModal(null);
    notifyCategoriesChanged();
  }

  /** 删除分类：后端会把该分类下效果自动置为未分类，不删除效果本身。 */
  async function handleDeleteCategory(category: EffectCategory) {
    await apiFetch(`/api/css-effects/categories/${category.id}`, { method: 'DELETE' });
    pushToast('分类已删除，原有默认归入未分类');
    setModal(null);
    notifyCategoriesChanged();
  }

  const openCategory = useCallback(
    (categoryId: string | null) => {
      navigate(`/css-effect/category/${toCategoryIdParam(categoryId)}`);
    },
    [navigate],
  );

  const isEmpty = !loading && categories.length === 0;

  return (
    <div className="ffm-effects-page">
      <header className="ffm-effects-main__header">
        <div className="ffm-effects-main__title">
          <h2>分类管理</h2>
          <p>按分类组织 CSS 效果资产，点击分类卡片进入该分类的效果列表。</p>
        </div>
        {isAdmin && (
          <div className="ffm-effects-main__actions">
            <button
              type="button"
              className="ffm-effects-btn ffm-effects-btn--primary"
              onClick={() => setModal({ mode: 'create' })}
            >
              + 新增分类
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="ffm-effects-empty">加载中…</div>
      ) : (
        <div className="ffm-effects-cat-grid">
          <CategoryCard
            name={UNCATEGORIZED_NAME}
            description="未归入任何分类的效果"
            fixed
            onOpen={() => openCategory(null)}
          />

          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              name={category.name}
              description={category.description || '暂无描述'}
              createdAt={category.createdAt}
              isAdmin={isAdmin}
              onOpen={() => openCategory(category.id)}
              onEdit={() => setModal({ mode: 'edit', category })}
              onDelete={() => setModal({ mode: 'delete', category })}
            />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ffm-effects-empty">
          <p className="ffm-effects-empty__title">
            {isAdmin ? '还没有分类，先创建一个' : '暂无分类'}
          </p>
          {isAdmin ? (
            <>
              <button
                type="button"
                className="ffm-effects-btn ffm-effects-btn--primary"
                onClick={() => setModal({ mode: 'create' })}
              >
                去创建第一个分类
              </button>
              <p className="ffm-effects-empty__sub">也可以先进入「未分类」查看已有素材</p>
            </>
          ) : (
            <p className="ffm-effects-empty__sub">请等待管理员创建分类</p>
          )}
        </div>
      )}

      {modal && modal.mode !== 'delete' && (
        <CategoryFormModal
          mode={modal.mode}
          initialName={modal.mode === 'edit' ? modal.category.name : ''}
          initialDescription={modal.mode === 'edit' ? (modal.category.description ?? '') : ''}
          currentId={modal.mode === 'edit' ? modal.category.id : undefined}
          categories={categories}
          onClose={() => setModal(null)}
          onSubmit={handleSaveCategory}
        />
      )}

      {modal && modal.mode === 'delete' && (
        <DeleteCategoryModal
          category={modal.category}
          onClose={() => setModal(null)}
          onConfirm={() => handleDeleteCategory(modal.category)}
        />
      )}

      <div className="ffm-effects-toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ffm-effects-toast ffm-effects-toast--${toast.kind}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

interface CategoryCardProps {
  name: string;
  description: string;
  createdAt?: string;
  fixed?: boolean;
  isAdmin?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function CategoryCard({
  name,
  description,
  createdAt,
  fixed,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
}: CategoryCardProps) {
  return (
    <div
      className={`ffm-effects-category-card${fixed ? ' ffm-effects-category-card--fixed' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="ffm-effects-category-card__head">
        <h3 className="ffm-effects-category-card__name">{name}</h3>
        {fixed && (
          <span
            className="ffm-effects-badge"
            style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
          >
            固定
          </span>
        )}
      </div>

      <p className="ffm-effects-category-card__desc">{description}</p>

      <div className="ffm-effects-category-card__meta">
        <span>
          {fixed ? '不可编辑 / 不可删除' : createdAt ? `创建于 ${formatDate(createdAt)}` : ''}
        </span>
        {!fixed && isAdmin && (
          <span className="ffm-effects-category-card__actions">
            <button
              type="button"
              className="ffm-effects-btn ffm-effects-btn--ghost"
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.();
              }}
            >
              编辑
            </button>
            <button
              type="button"
              className="ffm-effects-btn ffm-effects-btn--ghost"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
            >
              删除
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

interface CategoryFormModalProps {
  mode: 'create' | 'edit';
  initialName: string;
  initialDescription: string;
  currentId?: string;
  categories: EffectCategory[];
  onClose: () => void;
  onSubmit: (value: { name: string; description?: string }) => Promise<void>;
}

function CategoryFormModal({
  mode,
  initialName,
  initialDescription,
  currentId,
  categories,
  onClose,
  onSubmit,
}: CategoryFormModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('分类名称不能为空');
      return;
    }
    if (trimmed.length > 32) {
      setError('分类名称不能超过 32 字符');
      return;
    }
    const conflict = categories.some((c) => c.name === trimmed && c.id !== currentId);
    if (conflict) {
      setError('分类名称已存在');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, description: description.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存分类失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="ffm-effects-modal__header">
        <h3>{mode === 'create' ? '新增分类' : '编辑分类'}</h3>
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
        <label className="ffm-effects-field">
          <span className="ffm-effects-field__label">分类名称 *</span>
          <input
            className="ffm-effects-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={32}
            autoFocus
            placeholder="例如：基础 CSS"
          />
        </label>
        <label className="ffm-effects-field">
          <span className="ffm-effects-field__label">描述（可选）</span>
          <textarea
            className="ffm-effects-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="分类用途简述"
          />
        </label>
        {error && <div className="ffm-effects-form-error">{error}</div>}
      </div>
      <div className="ffm-effects-modal__footer">
        <button type="button" className="ffm-effects-btn ffm-effects-btn--ghost" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="ffm-effects-btn ffm-effects-btn--primary"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </ModalOverlay>
  );
}

interface DeleteCategoryModalProps {
  category: EffectCategory;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteCategoryModal({ category, onClose, onConfirm }: DeleteCategoryModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除分类失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="ffm-effects-modal__header">
        <h3>删除分类</h3>
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
        <p>
          确认删除分类「<strong>{category.name}</strong>
          」？该分类下的效果会移到「未分类」，不会被删除。
        </p>
        {error && <div className="ffm-effects-form-error">{error}</div>}
      </div>
      <div className="ffm-effects-modal__footer">
        <button type="button" className="ffm-effects-btn ffm-effects-btn--ghost" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="ffm-effects-btn ffm-effects-btn--danger"
          disabled={submitting}
          onClick={() => void handleConfirm()}
        >
          {submitting ? '删除中…' : '确认删除'}
        </button>
      </div>
    </ModalOverlay>
  );
}

interface ModalOverlayProps {
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}

/** 通用弹层：ESC 关闭 + 点击遮罩关闭，内容区阻止冒泡。 */
function ModalOverlay({ onClose, wide, children }: ModalOverlayProps) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="ffm-effects-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`ffm-effects-modal${wide ? ' ffm-effects-modal--wide' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
