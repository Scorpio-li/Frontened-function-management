import { useContext } from 'react';

import { AuthContext } from './context';
import type { AuthContextValue } from './types';

/** 读取认证上下文，必须在 AuthProvider 内使用。 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }

  return context;
}
