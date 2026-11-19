import type { CurrentUser } from '@repo/contracts';

/** 认证状态：加载中 / 未登录 / 已登录。 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser?: (user: CurrentUser | null) => void;
}
