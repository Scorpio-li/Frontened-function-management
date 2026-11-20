import { Link } from 'react-router-dom';

import { resolveFeaturePath, useFeatures } from '@repo/core';
import { Card, EmptyState, PageHeader } from '@repo/ui';

import { useAuth } from '../auth/useAuth';

const ROLE_LABELS = {
  admin: '管理员',
  viewer: '查看者',
} as const;

export function HomePage() {
  const { user } = useAuth();
  const entries = useFeatures();
  const enabledEntries = entries.filter((entry) => entry.enabled);
  const routeCount = enabledEntries.reduce(
    (total, entry) => total + entry.feature.routes.length,
    0,
  );

  return (
    <div className="page">
      <PageHeader
        title={`欢迎，${user?.username ?? '访客'}`}
        description="这里汇总了当前账号可访问的功能模块，点击「进入」即可开始使用。"
      />

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-card__label">当前角色</p>
          <p className="stat-card__value">{user ? ROLE_LABELS[user.role] : '未知'}</p>
          <p className="stat-card__hint">查看者仅可浏览，管理员可管理账号与功能</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">已启用功能</p>
          <p className="stat-card__value">{enabledEntries.length}</p>
          <p className="stat-card__hint">共 {entries.length} 个功能模块</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">可访问路由</p>
          <p className="stat-card__value">{routeCount}</p>
          <p className="stat-card__hint">来自已启用功能声明的路由</p>
        </div>
      </div>

      <Card title="快捷入口" description="已启用的功能模块，点击进入对应页面。">
        {enabledEntries.length === 0 ? (
          <EmptyState title="暂无可用功能" description="请先在功能管理中启用功能模块。" />
        ) : (
          <ul className="feature-list">
            {enabledEntries.map(({ feature }) => {
              const firstRoute = feature.routes[0];

              return (
                <li key={feature.id} className="feature-item">
                  <div className="feature-item__main">
                    <div className="feature-item__title">
                      <h3>{feature.name}</h3>
                    </div>
                    <p>{feature.description ?? '暂无描述'}</p>
                    <p className="feature-item__meta">
                      v{feature.version ?? '0.0.0'} · {feature.routes.length} 个路由
                    </p>
                  </div>
                  {firstRoute ? (
                    <Link
                      className="ffm-button ffm-button--secondary ffm-button--sm"
                      to={resolveFeaturePath(feature.id, firstRoute.path)}
                    >
                      进入
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
