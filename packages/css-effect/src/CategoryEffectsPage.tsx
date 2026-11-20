import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { CSS_EFFECTS_PAGE_CSS } from './CategoryManagePage';
import { EffectCodeModal } from './EffectCodeModal';
import { EffectPreview } from './EffectPreview';
import type { Toast } from './shared';
import { EFFECT_TYPE_LABEL, apiFetch, tagStyle, useCategories, useCurrentUser } from './shared';
import type { CssEffect, EffectCategory, EffectType } from './types';
import { UNCATEGORIZED_NAME, parseCategoryIdParam } from './types';

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

let toastSeed = 0;

// ---------------------------------------------------------------------------
// 主页面：某个分类下的效果列表
// ---------------------------------------------------------------------------

type EffectModalState = { mode: 'create' } | { mode: 'edit'; effect: CssEffect };

export function CategoryEffectsPage() {
  const navigate = useNavigate();
  const params = useParams<{ categoryId: string }>();
  const categoryId = parseCategoryIdParam(params.categoryId);

  const { user } = useCurrentUser();
  const isAdmin = user?.role === 'admin';
  const { categories, loading: categoriesLoading } = useCategories();

  const [effects, setEffects] = useState<CssEffect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 搜索（防抖 300ms）
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimerRef = useRef<number | null>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal 状态
  const [codeEffect, setCodeEffect] = useState<CssEffect | null>(null);
  const [effectModal, setEffectModal] = useState<EffectModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CssEffect | null>(null);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  /** undefined 表示尚未选择；null 表示「未分类」。 */
  const [batchTarget, setBatchTarget] = useState<string | null | undefined>(undefined);

  const pushToast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    toastSeed += 1;
    const id = toastSeed;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => {
      setError((current) => (current === message ? null : current));
    }, 4000);
  }, []);

  const fetchEffects = useCallback(async () => {
    setLoading(true);
    try {
      const search = new URLSearchParams();
      search.set('categoryId', categoryId ?? 'null');
      if (debouncedQuery) search.set('q', debouncedQuery);

      const data = await apiFetch<CssEffect[]>(`/api/css-effects/effects?${search.toString()}`);
      setEffects(Array.isArray(data) ? data : []);
    } catch (err) {
      setEffects([]);
      showError(err instanceof Error ? err.message : '加载效果失败');
    } finally {
      setLoading(false);
    }
  }, [categoryId, debouncedQuery, showError]);

  useEffect(() => {
    ensureCss();
  }, []);

  useEffect(() => {
    void fetchEffects();
    setSelectedIds(new Set());
  }, [fetchEffects]);

  // 搜索防抖
  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const category = useMemo(
    () =>
      categoryId === null ? null : (categories.find((item) => item.id === categoryId) ?? null),
    [categories, categoryId],
  );
  const categoryName = categoryId === null ? UNCATEGORIZED_NAME : (category?.name ?? '');
  const categoryNotFound = categoryId !== null && !categoriesLoading && category === null;

  // =========================================================================
  // 效果操作
  // =========================================================================

  async function handleSaveEffect(value: EffectFormValue) {
    const body = buildEffectBody(value);
    if (effectModal?.mode === 'edit') {
      await apiFetch<CssEffect>(`/api/css-effects/effects/${effectModal.effect.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      pushToast('效果已更新');
    } else {
      await apiFetch<CssEffect>('/api/css-effects/effects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      pushToast('效果已创建');
    }
    setEffectModal(null);
    await fetchEffects();
  }

  async function handleDeleteEffect(effect: CssEffect) {
    await apiFetch(`/api/css-effects/effects/${effect.id}`, { method: 'DELETE' });
    pushToast('效果已删除');
    setDeleteTarget(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(effect.id);
      return next;
    });
    await fetchEffects();
  }

  async function handleBatchMove() {
    if (selectedIds.size === 0 || batchTarget === undefined) return;
    const effectIds = Array.from(selectedIds);
    const result = await apiFetch<{ moved: number }>('/api/css-effects/effects/batch-move', {
      method: 'POST',
      body: JSON.stringify({ effectIds, targetCategoryId: batchTarget }),
    });
    pushToast(`已转移 ${result?.moved ?? effectIds.length} 个效果`);
    setBatchMoveOpen(false);
    setBatchTarget(undefined);
    setSelectedIds(new Set());
    await fetchEffects();
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // =========================================================================
  // 渲染
  // =========================================================================

  if (categoryNotFound) {
    return (
      <div className="ffm-effects-page">
        <button type="button" className="ffm-effects-back" onClick={() => navigate('/css-effect')}>
          ← 分类管理
        </button>
        <div className="ffm-effects-empty">
          <p className="ffm-effects-empty__title">分类不存在或已删除</p>
          <p className="ffm-effects-empty__sub">该分类可能已被删除，请返回分类管理重新选择。</p>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="ffm-effects-btn ffm-effects-btn--primary"
              onClick={() => navigate('/css-effect')}
            >
              返回分类管理
            </button>
          </div>
        </div>
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  return (
    <div className="ffm-effects-page">
      <button type="button" className="ffm-effects-back" onClick={() => navigate('/css-effect')}>
        ← 分类管理
      </button>

      <header className="ffm-effects-main__header">
        <div className="ffm-effects-main__title">
          <h2>
            {categoryName}
            <span
              className="ffm-effects-badge"
              style={{ backgroundColor: '#f3f4f6', color: '#4b5563', marginLeft: 10 }}
            >
              共 {effects.length} 个效果
            </span>
          </h2>
          <p>
            {category?.description ||
              (categoryId === null ? '未归入任何分类的效果' : '该分类下的效果资产')}
          </p>
        </div>

        <div className="ffm-effects-main__actions">
          <input
            type="search"
            className="ffm-effects-input ffm-effects-input--search"
            placeholder="搜索效果（名称 / 描述 / 标签）…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {isAdmin && (
            <>
              <button
                type="button"
                className="ffm-effects-btn ffm-effects-btn--primary"
                onClick={() => setEffectModal({ mode: 'create' })}
              >
                + 新增效果
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  className="ffm-effects-btn"
                  onClick={() => {
                    setBatchTarget(undefined);
                    setBatchMoveOpen(true);
                  }}
                >
                  批量转移 ({selectedIds.size})
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="ffm-effects-error-banner" role="alert">
          {error}
        </div>
      )}

      {isAdmin && selectedIds.size > 0 && (
        <div className="ffm-effects-batch-bar">
          <span>已选 {selectedIds.size} 个效果</span>
          <button type="button" onClick={() => setSelectedIds(new Set())}>
            清空选择
          </button>
        </div>
      )}

      {loading ? (
        <div className="ffm-effects-empty">加载中…</div>
      ) : effects.length === 0 ? (
        <div className="ffm-effects-empty">
          <p className="ffm-effects-empty__title">暂无效果</p>
          {isAdmin ? (
            <>
              <button
                type="button"
                className="ffm-effects-btn ffm-effects-btn--primary"
                onClick={() => setEffectModal({ mode: 'create' })}
              >
                去创建第一个效果
              </button>
              <p className="ffm-effects-empty__sub">新效果会默认归入当前分类</p>
            </>
          ) : (
            <p className="ffm-effects-empty__sub">请等待管理员添加效果资产</p>
          )}
        </div>
      ) : (
        <div
          className="ffm-effects-grid"
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {effects.map((effect) => (
            <EffectCard
              key={effect.id}
              effect={effect}
              isAdmin={isAdmin}
              selected={selectedIds.has(effect.id)}
              onToggleSelect={() => toggleSelection(effect.id)}
              onOpenCode={() => setCodeEffect(effect)}
              onEdit={() => setEffectModal({ mode: 'edit', effect })}
              onDelete={() => setDeleteTarget(effect)}
            />
          ))}
        </div>
      )}

      {codeEffect && <EffectCodeModal effect={codeEffect} onClose={() => setCodeEffect(null)} />}

      {effectModal && (
        <EffectFormModal
          mode={effectModal.mode}
          initial={effectModal.mode === 'edit' ? effectModal.effect : undefined}
          defaultCategoryId={categoryId}
          categories={categories}
          onClose={() => setEffectModal(null)}
          onSubmit={handleSaveEffect}
        />
      )}

      {deleteTarget && (
        <DeleteEffectModal
          effect={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteEffect(deleteTarget)}
        />
      )}

      {batchMoveOpen && (
        <BatchMoveModal
          categories={categories}
          count={selectedIds.size}
          target={batchTarget}
          onTargetChange={setBatchTarget}
          onClose={() => {
            setBatchMoveOpen(false);
            setBatchTarget(undefined);
          }}
          onConfirm={handleBatchMove}
        />
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
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
  );
}

interface EffectCardProps {
  effect: CssEffect;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenCode: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function EffectCard({
  effect,
  isAdmin,
  selected,
  onToggleSelect,
  onOpenCode,
  onEdit,
  onDelete,
}: EffectCardProps) {
  const typeMeta = EFFECT_TYPE_LABEL[effect.effectType];

  return (
    <div className={`ffm-effects-card${selected ? ' ffm-effects-card--selected' : ''}`}>
      {isAdmin && (
        <div className="ffm-effects-card__corner">
          <label className="ffm-effects-checkbox" title="选择该效果">
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
            <span className="ffm-effects-checkbox__indicator" />
          </label>
          <button
            type="button"
            className="ffm-effects-icon-btn ffm-effects-icon-btn--danger"
            title="删除"
            aria-label="删除"
            onClick={onDelete}
          >
            ✕
          </button>
        </div>
      )}

      <div
        className="ffm-effects-card__preview"
        role="button"
        tabIndex={0}
        onClick={onOpenCode}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenCode();
          }
        }}
      >
        <EffectPreview effect={effect} mode="thumb" />
      </div>

      <div
        className="ffm-effects-card__body"
        role="button"
        tabIndex={0}
        onClick={onOpenCode}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenCode();
          }
        }}
      >
        <div className="ffm-effects-card__title-row">
          <h4 className="ffm-effects-card__title">{effect.name}</h4>
          <span
            className="ffm-effects-badge"
            style={{ backgroundColor: typeMeta.bg, color: typeMeta.text }}
          >
            {typeMeta.label}
          </span>
        </div>

        {effect.description ? <p className="ffm-effects-card__desc">{effect.description}</p> : null}

        {effect.tags.length > 0 ? (
          <div className="ffm-effects-card__tags">
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
          </div>
        ) : null}
      </div>

      <div className="ffm-effects-card__footer">
        {isAdmin && (
          <button type="button" className="ffm-effects-btn ffm-effects-btn--ghost" onClick={onEdit}>
            编辑
          </button>
        )}
        <button
          type="button"
          className="ffm-effects-btn ffm-effects-btn--ghost"
          onClick={onOpenCode}
        >
          查看代码
        </button>
      </div>
    </div>
  );
}

interface EffectFormValue {
  name: string;
  categoryId: string | null;
  effectType: EffectType;
  tags: string[];
  description?: string;
  html?: string;
  css?: string;
  js?: string;
  echartsOption?: unknown;
}

interface EffectFormModalProps {
  mode: 'create' | 'edit';
  initial?: CssEffect;
  defaultCategoryId: string | null;
  categories: EffectCategory[];
  onClose: () => void;
  onSubmit: (value: EffectFormValue) => Promise<void>;
}

function EffectFormModal({
  mode,
  initial,
  defaultCategoryId,
  categories,
  onClose,
  onSubmit,
}: EffectFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    initial ? initial.categoryId : defaultCategoryId,
  );
  const [effectType, setEffectType] = useState<EffectType>(initial?.effectType ?? 'css');
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(', '));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [html, setHtml] = useState(initial?.html ?? '');
  const [css, setCss] = useState(initial?.css ?? '');
  const [js, setJs] = useState(initial?.js ?? '');
  const [echartsRaw, setEchartsRaw] = useState(
    initial?.echartsOption !== undefined ? JSON.stringify(initial.echartsOption, null, 2) : '',
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      setFormError('效果名称不能为空');
      return;
    }
    if (name.trim().length > 64) {
      setFormError('效果名称不能超过 64 字符');
      return;
    }

    let echartsOption: unknown = undefined;
    if (effectType === 'echarts') {
      const trimmed = echartsRaw.trim();
      if (!trimmed) {
        setFormError('ECharts 效果必须填写 echartsOption（JSON）');
        return;
      }
      try {
        echartsOption = JSON.parse(trimmed) as unknown;
      } catch {
        setFormError('echartsOption 不是合法的 JSON');
        return;
      }
    }

    const tags = tagsRaw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        categoryId,
        effectType,
        tags,
        description: description.trim() || undefined,
        html: html.trim() || undefined,
        css: css.trim() || undefined,
        js: js.trim() || undefined,
        echartsOption,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存效果失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      <div className="ffm-effects-modal__header">
        <h3>{mode === 'edit' ? '编辑效果' : '新增效果'}</h3>
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
        <div className="ffm-effects-form-grid">
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">效果名称 *</span>
            <input
              className="ffm-effects-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={64}
              placeholder="例如：呼吸动画"
              autoFocus
            />
          </label>
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">所属分类</span>
            <select
              className="ffm-effects-input"
              value={categoryId ?? ''}
              onChange={(event) => setCategoryId(event.target.value || null)}
            >
              <option value="">{UNCATEGORIZED_NAME}</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">效果类型 *</span>
            <select
              className="ffm-effects-input"
              value={effectType}
              onChange={(event) => setEffectType(event.target.value as EffectType)}
            >
              <option value="css">CSS</option>
              <option value="animation">动画</option>
              <option value="echarts">ECharts</option>
            </select>
          </label>
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">标签（逗号分隔）</span>
            <input
              className="ffm-effects-input"
              value={tagsRaw}
              onChange={(event) => setTagsRaw(event.target.value)}
              placeholder="例如：动画, 光晕, 柔和"
            />
          </label>
        </div>

        <label className="ffm-effects-field">
          <span className="ffm-effects-field__label">描述（可选）</span>
          <textarea
            className="ffm-effects-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="效果用途简述"
          />
        </label>

        <div className="ffm-effects-form-grid">
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">HTML</span>
            <textarea
              className="ffm-effects-input ffm-effects-input--code"
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              rows={6}
              placeholder='<div class="demo">...</div>'
            />
          </label>
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">CSS</span>
            <textarea
              className="ffm-effects-input ffm-effects-input--code"
              value={css}
              onChange={(event) => setCss(event.target.value)}
              rows={6}
              placeholder=".demo { ... }"
            />
          </label>
        </div>

        <label className="ffm-effects-field">
          <span className="ffm-effects-field__label">JavaScript（完整预览时执行）</span>
          <textarea
            className="ffm-effects-input ffm-effects-input--code"
            value={js}
            onChange={(event) => setJs(event.target.value)}
            rows={6}
            placeholder="// 例如：const chart = echarts.init(document.getElementById('echarts-container'))"
          />
        </label>

        {effectType === 'echarts' && (
          <label className="ffm-effects-field">
            <span className="ffm-effects-field__label">echartsOption（JSON 格式）*</span>
            <textarea
              className="ffm-effects-input ffm-effects-input--code"
              value={echartsRaw}
              onChange={(event) => setEchartsRaw(event.target.value)}
              rows={6}
              placeholder='{ "tooltip": {}, "series": [] }'
            />
          </label>
        )}

        {formError && <div className="ffm-effects-form-error">{formError}</div>}
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
          {submitting ? '保存中…' : mode === 'edit' ? '保存修改' : '创建效果'}
        </button>
      </div>
    </ModalOverlay>
  );
}

interface BatchMoveModalProps {
  categories: EffectCategory[];
  count: number;
  target: string | null | undefined;
  onTargetChange: (value: string | null) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function BatchMoveModal({
  categories,
  count,
  target,
  onTargetChange,
  onClose,
  onConfirm,
}: BatchMoveModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canConfirm = count > 0 && target !== undefined;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量转移失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="ffm-effects-modal__header">
        <h3>批量转移效果</h3>
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
          已选中 <strong>{count}</strong> 个效果，请选择目标分类：
        </p>
        <label className="ffm-effects-field">
          <span className="ffm-effects-field__label">目标分类</span>
          <select
            className="ffm-effects-input"
            value={target === undefined ? '' : target === null ? 'null' : target}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') onTargetChange(null);
              else if (value === 'null') onTargetChange(null);
              else onTargetChange(value);
            }}
          >
            <option value="" disabled>
              请选择目标分类
            </option>
            <option value="null">{UNCATEGORIZED_NAME}</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
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
          disabled={!canConfirm || submitting}
          onClick={() => void handleConfirm()}
        >
          {submitting ? '转移中…' : '确认转移'}
        </button>
      </div>
    </ModalOverlay>
  );
}

interface DeleteEffectModalProps {
  effect: CssEffect;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteEffectModal({ effect, onClose, onConfirm }: DeleteEffectModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除效果失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="ffm-effects-modal__header">
        <h3>确认删除</h3>
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
          确认删除效果「<strong>{effect.name}</strong>」吗？该操作不可恢复。
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

// ---------------------------------------------------------------------------
// 提交体组装
// ---------------------------------------------------------------------------

function buildEffectBody(data: EffectFormValue): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: data.name,
    categoryId: data.categoryId,
    effectType: data.effectType,
    tags: data.tags,
  };
  if (data.description !== undefined) body.description = data.description;
  if (data.html !== undefined) body.html = data.html;
  if (data.css !== undefined) body.css = data.css;
  if (data.js !== undefined) body.js = data.js;
  if (data.echartsOption !== undefined) body.echartsOption = data.echartsOption;
  return body;
}
