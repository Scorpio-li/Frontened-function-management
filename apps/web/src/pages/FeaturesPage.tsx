import { useCallback, useEffect, useState } from 'react';

import type { FeatureItem } from '@repo/contracts';
import { Badge, Button, Card, EmptyState, PageHeader } from '@repo/ui';

import { ApiRequestError, api } from '../api/client';
import { FEATURE_KIND_LABELS } from '../feature-kinds';
import { FeatureDialog } from '../components/FeatureDialog';
import { useAuth } from '../auth/useAuth';

type DialogState = { mode: 'create' } | { mode: 'edit'; feature: FeatureItem };

interface Notice {
  tone: 'success' | 'danger';
  message: string;
}

/** 以本地化格式展示 ISO 时间，解析失败时原样返回。 */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function FeaturesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.listFeatures();
      setFeatures(data);
    } catch (loadError) {
      setError(
        loadError instanceof ApiRequestError ? loadError.message : '功能列表加载失败，请稍后重试',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  function handleDialogSuccess(message: string): void {
    setDialog(null);
    setNotice({ tone: 'success', message });
    void loadFeatures();
  }

  function handleOpen(feature: FeatureItem): void {
    window.open(feature.url, '_blank', 'noopener,noreferrer');
  }

  async function handleDelete(feature: FeatureItem): Promise<void> {
    if (!window.confirm(`确定删除功能「${feature.name}」吗？删除后不可恢复。`)) {
      return;
    }

    setDeletingId(feature.id);

    try {
      await api.deleteFeature(feature.id);
      setNotice({ tone: 'success', message: `已删除功能 ${feature.name}` });
      await loadFeatures();
    } catch (deleteError) {
      setNotice({
        tone: 'danger',
        message:
          deleteError instanceof ApiRequestError ? deleteError.message : '删除失败，请稍后重试',
      });
    } finally {
      setDeletingId(null);
    }
  }

  function renderContent() {
    if (loading) {
      return <p className="form-hint">正在加载功能列表…</p>;
    }

    if (error !== null) {
      return (
        <div>
          <p className="form-error" role="alert">
            {error}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void loadFeatures()}>
            重试
          </Button>
        </div>
      );
    }

    if (features.length === 0) {
      return (
        <EmptyState
          title="暂无功能"
          description={isAdmin ? '点击右上角「新增功能」登记第一个功能。' : '管理员尚未登记功能。'}
        />
      );
    }

    return (
      <ul className="feature-list">
        {features.map((feature) => (
          <li key={feature.id} className="feature-item">
            <div className="feature-item__main">
              <div className="feature-item__title">
                <h3>{feature.name}</h3>
                <Badge tone="info">{FEATURE_KIND_LABELS[feature.kind]}</Badge>
              </div>
              <p className="feature-item__url">{feature.url}</p>
              <p>{feature.description || '暂无描述'}</p>
              <p className="feature-item__meta">更新于 {formatTime(feature.updatedAt)}</p>
            </div>

            <div className="table-actions">
              <Button size="sm" variant="secondary" onClick={() => handleOpen(feature)}>
                打开
              </Button>
              {isAdmin ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog({ mode: 'edit', feature })}
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={deletingId === feature.id}
                    onClick={() => void handleDelete(feature)}
                  >
                    {deletingId === feature.id ? '删除中…' : '删除'}
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="功能列表"
        description={
          isAdmin
            ? '登记平台包含的功能项目，点击「打开」在新窗口运行；只有管理员可以新增、编辑或删除。'
            : '当前账号为查看者，仅可浏览并打开功能。'
        }
        actions={
          isAdmin ? (
            <Button onClick={() => setDialog({ mode: 'create' })}>新增功能</Button>
          ) : undefined
        }
      />

      {notice !== null ? (
        <p
          className={`banner banner--${notice.tone}`}
          role={notice.tone === 'danger' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      ) : null}

      <Card
        title="已登记功能"
        description={
          isAdmin
            ? '支持 HTML、Vue、React、ECharts、Node 等不同技术栈项目的地址。'
            : '如需调整功能，请联系管理员。'
        }
      >
        {renderContent()}
      </Card>

      {dialog !== null ? (
        <FeatureDialog
          mode={dialog.mode}
          feature={dialog.mode === 'edit' ? dialog.feature : undefined}
          onClose={() => setDialog(null)}
          onSuccess={handleDialogSuccess}
        />
      ) : null}
    </div>
  );
}
