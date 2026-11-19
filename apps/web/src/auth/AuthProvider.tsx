import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { CurrentUser } from '@repo/contracts';

import { api } from '../api/client';
import { AuthContext } from './context';
import type { AuthStatus } from './types';

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // 启动时尝试恢复会话；StrictMode 下 effect 会执行两次，用 cancelled 忽略过期结果。
  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setUser(response.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setUser(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 任意接口返回 401 时，由 API 客户端广播事件，这里统一清理登录态。
  useEffect(() => {
    function handleAuthExpired(): void {
      setUser(null);
      setStatus('anonymous');
    }

    window.addEventListener('ffm:auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('ffm:auth-expired', handleAuthExpired);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login({ username, password });
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // 注销接口失败（如会话已过期）也要清空本地登录态。
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, setUser }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
