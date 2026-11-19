import { useFeatureRegistry, useFeatures } from '@repo/core';
import { Badge, Button, Card, PageHeader } from '@repo/ui';

export function FeatureManagerPage() {
  const entries = useFeatures();
  const registry = useFeatureRegistry();

  const enabledCount = entries.filter((entry) => entry.enabled).length;
  const routeCount = entries.reduce((total, entry) => total + entry.feature.routes.length, 0);
  const hasDisabled = enabledCount < entries.length;

  function enableAll(): void {
    for (const entry of entries) {
      if (!entry.enabled) {
        registry.setEnabled(entry.feature.id, true);
      }
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="功能管理"
        description="功能模块由 packages/feature-* 独立提供，宿主自动挂载路由与导航；启停状态保存在浏览器本地。"
        actions={
          <Button variant="secondary" disabled={!hasDisabled} onClick={enableAll}>
            全部启用
          </Button>
        }
      />

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-card__label">功能总数</p>
          <p className="stat-card__value">{entries.length}</p>
          <p className="stat-card__hint">来自独立的工作区包</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">已启用</p>
          <p className="stat-card__value">{enabledCount}</p>
          <p className="stat-card__hint">停用后路由与导航立即移除</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">声明路由</p>
          <p className="stat-card__value">{routeCount}</p>
          <p className="stat-card__hint">由功能契约统一声明</p>
        </div>
      </div>

      <Card
        title="已注册功能"
        description="停用只影响路由与导航；功能模块的 setup 在启动时执行一次，事件监听保持不变。"
      >
        <ul className="feature-list">
          {entries.map(({ feature, enabled }) => (
            <li key={feature.id} className="feature-item">
              <div className="feature-item__main">
                <div className="feature-item__title">
                  <h3>{feature.name}</h3>
                  <code>{feature.id}</code>
                  <Badge tone={enabled ? 'success' : 'neutral'}>
                    {enabled ? '已启用' : '已停用'}
                  </Badge>
                </div>
                <p>{feature.description ?? '暂无描述'}</p>
                <p className="feature-item__meta">
                  v{feature.version ?? '0.0.0'} · {feature.routes.length} 个路由
                </p>
              </div>
              <Button
                variant={enabled ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => registry.setEnabled(feature.id, !enabled)}
              >
                {enabled ? '停用' : '启用'}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
