import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import type { Role } from '@repo/contracts';
import { resolveFeaturePath, useFeatures } from '@repo/core';
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

  const isAdmin = user?.role === 'admin';

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
            {isAdmin ? (
              <NavLink
                to="/features"
                className={({ isActive }) =>
                  cn('app-nav__link', isActive && 'app-nav__link--active')
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
      </main>
    </div>
  );
}
