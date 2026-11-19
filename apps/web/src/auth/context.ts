import { createContext } from 'react';

import type { AuthContextValue } from './types';

/** 认证上下文默认值为 null，未包裹 Provider 时由 useAuth 抛错提示。 */
export const AuthContext = createContext<AuthContextValue | null>(null);
