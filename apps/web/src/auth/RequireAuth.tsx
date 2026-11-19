import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './useAuth';

/** 登录守卫：加载中显示全屏占位，未登录跳转登录页并记录来源地址。 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="auth-loading" role="status">
        正在恢复登录状态…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/** 管理员守卫：非管理员访问受限页面时回到账号管理页。 */
export function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/accounts" replace />;
  }

  return <Outlet />;
}
