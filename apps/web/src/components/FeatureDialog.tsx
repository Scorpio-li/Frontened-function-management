import { useEffect, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';

import {
  FEATURE_DESCRIPTION_MAX_LENGTH,
  FEATURE_KINDS,
  FEATURE_NAME_MAX_LENGTH,
  FEATURE_URL_MAX_LENGTH,
} from '@repo/contracts';
import type {
  CreateFeatureRequest,
  FeatureItem,
  FeatureKind,
  UpdateFeatureRequest,
} from '@repo/contracts';
import { Button } from '@repo/ui';

import { ApiRequestError, api } from '../api/client';
import { FEATURE_KIND_LABELS } from '../feature-kinds';

/** 与后端保持一致：http(s) 绝对地址或以 / 开头的站内路径。 */
function isValidUrl(value: string): boolean {
  if (value.startsWith('/')) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface FeatureDialogProps {
  mode: 'create' | 'edit';
  /** 编辑模式下待修改的功能条目。 */
  feature?: FeatureItem;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function FeatureDialog({ mode, feature, onClose, onSuccess }: FeatureDialogProps) {
  const [name, setName] = useState(feature?.name ?? '');
  const [kind, setKind] = useState<FeatureKind>(feature?.kind ?? 'html');
  const [url, setUrl] = useState(feature?.url ?? '');
  const [description, setDescription] = useState(feature?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = mode === 'edit';

  // 按 ESC 关闭，提交中不响应。
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, submitting]);

  function validate(trimmedName: string, trimmedUrl: string): string | null {
    if (!trimmedName) {
      return '请输入功能名称';
    }

    if (trimmedName.length > FEATURE_NAME_MAX_LENGTH) {
      return `功能名称不能超过 ${FEATURE_NAME_MAX_LENGTH} 个字符`;
    }

    if (!trimmedUrl) {
      return '请输入功能地址';
    }

    if (trimmedUrl.length > FEATURE_URL_MAX_LENGTH) {
      return `功能地址不能超过 ${FEATURE_URL_MAX_LENGTH} 个字符`;
    }

    if (!isValidUrl(trimmedUrl)) {
      return '功能地址需为 http(s) 链接或以 / 开头的站内路径';
    }

    if (description.trim().length > FEATURE_DESCRIPTION_MAX_LENGTH) {
      return `功能描述不能超过 ${FEATURE_DESCRIPTION_MAX_LENGTH} 个字符`;
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const validationError = validate(trimmedName, trimmedUrl);
    if (validationError !== null) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const payload: CreateFeatureRequest & UpdateFeatureRequest = {
        name: trimmedName,
        kind,
        url: trimmedUrl,
        description: description.trim(),
      };

      if (isEdit && feature) {
        await api.updateFeature(feature.id, payload);
        onSuccess(`已更新功能 ${trimmedName}`);
      } else {
        await api.createFeature(payload);
        onSuccess(`已新增功能 ${trimmedName}`);
      }
    } catch (submitError) {
      setError(
        submitError instanceof ApiRequestError ? submitError.message : '操作失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="feature-dialog-title">
        <header className="modal__header">
          <h2 id="feature-dialog-title">{isEdit ? '编辑功能' : '新增功能'}</h2>
          <p>
            {isEdit
              ? '修改功能信息，保存后列表立即生效。'
              : '登记一个可访问的功能地址，所有登录用户都能在功能列表中看到。'}
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body">
            <label className="form-field" htmlFor="feature-name">
              <span>功能名称</span>
              <input
                id="feature-name"
                name="name"
                value={name}
                maxLength={FEATURE_NAME_MAX_LENGTH}
                autoComplete="off"
                autoFocus
                disabled={submitting}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="form-field" htmlFor="feature-kind">
              <span>功能类型</span>
              <select
                id="feature-kind"
                name="kind"
                value={kind}
                disabled={submitting}
                onChange={(event) => setKind(event.target.value as FeatureKind)}
              >
                {FEATURE_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {FEATURE_KIND_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field" htmlFor="feature-url">
              <span>访问地址</span>
              <input
                id="feature-url"
                name="url"
                value={url}
                maxLength={FEATURE_URL_MAX_LENGTH}
                placeholder="https://example.com 或 /apps/demo"
                autoComplete="off"
                disabled={submitting}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>

            <label className="form-field" htmlFor="feature-description">
              <span>功能描述</span>
              <textarea
                id="feature-description"
                name="description"
                value={description}
                rows={3}
                maxLength={FEATURE_DESCRIPTION_MAX_LENGTH}
                disabled={submitting}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            {error !== null ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="modal__footer">
            <Button variant="secondary" disabled={submitting} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中…' : isEdit ? '保存' : '创建'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
