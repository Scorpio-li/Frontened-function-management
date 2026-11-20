import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@repo/ui';

import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/useAuth';

/** 从路由 state 中解析登录后的回跳地址，非法或缺失时回到首页。 */
function resolveRedirectTarget(state: unknown): string {
  if (typeof state !== 'object' || state === null) {
    return '/';
  }

  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'object' || from === null) {
    return '/';
  }

  const pathname = (from as { pathname?: unknown }).pathname;
  if (typeof pathname === 'string' && pathname !== '' && pathname !== '/login') {
    return pathname;
  }

  return '/';
}

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 已登录用户直接进入首页。
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const busy = submitting || status === 'loading';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (busy) {
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('请输入用户名');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await login(trimmedUsername, password);
      navigate(resolveRedirectTarget(location.state), { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof ApiRequestError ? submitError.message : '登录失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">FF · 功能管理台</p>
        <h1 className="auth-title">登录</h1>
        <p className="auth-subtitle">登录后可访问功能模块；管理员可管理账号与功能启停。</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="form-field" htmlFor="login-username">
            <span>用户名</span>
            <input
              id="login-username"
              name="username"
              value={username}
              autoComplete="username"
              autoFocus
              disabled={submitting}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="form-field" htmlFor="login-password">
            <span>密码</span>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error !== null ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={busy}>
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>

        <p className="auth-footer">使用本地配置的管理员账号登录</p>
      </div>
    </div>
  );
}
