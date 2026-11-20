import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import type { Role } from '@repo/contracts';
import { resolveFeaturePath, useFeatures } from '@repo/core';
import { Card } from '@repo/ui';
import { cn } from '@repo/utils';

import { useAuth } from '../auth/useAuth';

const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  viewer: '查看者',
};

export function AppShell() {
  const entries = useFeatures();
  const enabledEntries = entries.filter((entry) => entry.enabled);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.role === 'admin';

  const [featureMenuOpen, setFeatureMenuOpen] = useState(true);

  // 当前路由所属功能，用于在页面底部展示该功能的实现步骤。
  const activeFeature = enabledEntries.find(({ feature }) => {
    const base = `/${feature.id}`;
    return location.pathname === base || location.pathname.startsWith(`${base}/`);
  })?.feature;
  const implementationSteps = activeFeature?.implementationSteps ?? [];

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand__mark">FF</span>
          <div>
            <p className="app-brand__name">功能管理台</p>
            <p className="app-brand__desc">Monorepo 插件化宿主</p>
          </div>
        </div>

        <nav className="app-nav" aria-label="主导航">
          <NavLink
            to="/"
            end
            className={({ isActive }) => cn('app-nav__link', isActive && 'app-nav__link--active')}
          >
            首页
          </NavLink>

          <div className="app-nav__group">
            <button
              type="button"
              className="app-nav__toggle"
              aria-expanded={featureMenuOpen}
              onClick={() => setFeatureMenuOpen((open) => !open)}
            >
              <span>功能管理</span>
              <span
                className={cn('app-nav__chevron', featureMenuOpen && 'app-nav__chevron--open')}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>

            {featureMenuOpen ? (
              <div className="app-nav__children">
                {isAdmin ? (
                  <NavLink
                    to="/features"
                    className={({ isActive }) =>
                      cn('app-nav__link', 'app-nav__link--sub', isActive && 'app-nav__link--active')
                    }
                  >
                    功能配置
                  </NavLink>
                ) : null}

                {enabledEntries.map(({ feature }) => {
                  const isMultiRoute = feature.routes.length > 1;

                  return (
                    <div key={feature.id} className="app-nav__subgroup">
                      {isMultiRoute ? <p className="app-nav__subtitle">{feature.name}</p> : null}
                      {feature.routes.map((route) => (
                        <NavLink
                          key={`${feature.id}:${route.path}`}
                          to={resolveFeaturePath(feature.id, route.path)}
                          className={({ isActive }) =>
                            cn(
                              'app-nav__link',
                              'app-nav__link--sub',
                              isActive && 'app-nav__link--active',
                            )
                          }
                        >
                          {isMultiRoute ? route.label : feature.name}
                        </NavLink>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="app-nav__group app-nav__group--bottom">
            <NavLink
              to="/accounts"
              className={({ isActive }) => cn('app-nav__link', isActive && 'app-nav__link--active')}
            >
              账号管理
            </NavLink>
          </div>
        </nav>

        <div className="app-sidebar__footer">
          <div className="app-user">
            <div>
              <p className="app-user__name">{user?.username ?? '未登录'}</p>
              <p className="app-user__role">{user ? ROLE_LABELS[user.role] : '未知角色'}</p>
            </div>
            <button type="button" className="app-user__logout" onClick={() => void handleLogout()}>
              退出登录
            </button>
          </div>
          <p>
            {enabledEntries.length} / {entries.length} 个功能已启用
          </p>
          <p>v0.1.0</p>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />

        {implementationSteps.length > 0 ? (
          <div className="feature-implementation">
            <Card
              title="实现步骤"
              description={`在其他项目中复用「${activeFeature?.name ?? ''}」的步骤。`}
            >
              <ol className="ffm-steps">
                {implementationSteps.map((step, index) => (
                  <li key={step.text} className="ffm-steps__item">
                    <span className="ffm-steps__index">{index + 1}</span>
                    <div className="ffm-steps__content">
                      <span>{step.text}</span>
                      {step.code ? (
                        <pre className="ffm-steps__code">
                          <code>{step.code}</code>
                        </pre>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
