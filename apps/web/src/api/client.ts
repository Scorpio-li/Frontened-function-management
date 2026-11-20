import type {
  Account,
  ApiError,
  ApiErrorCode,
  AuthResponse,
  CreateAccountRequest,
  CreateFeatureRequest,
  FeatureItem,
  LoginRequest,
  UpdateAccountRequest,
  UpdateFeatureRequest,
} from '@repo/contracts';

/** 统一前缀，开发环境由 Vite 代理转发到本地后端。 */
const API_BASE = '/api';

/** 这两个接口的 401 属于正常业务流程（未登录 / 凭证错误），不应触发全局登录失效。 */
const AUTH_PROBE_PATHS = new Set(['/auth/login', '/auth/me']);

/** 接口请求失败时抛出的错误，保留 HTTP 状态码与业务错误码。 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(message: string, status: number, code: ApiErrorCode) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as { code?: unknown; message?: unknown };
  return typeof record.code === 'string' && typeof record.message === 'string';
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const payload: unknown = await response.json();
    if (isApiError(payload)) {
      return payload;
    }
  } catch {
    // 响应体不是 JSON 时回退到通用文案。
  }

  return {
    code: 'INTERNAL_ERROR',
    message:
      response.status === 401 ? '登录状态已失效，请重新登录' : `请求失败（${response.status}）`,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError('网络请求失败，请确认后端服务已启动', 0, 'INTERNAL_ERROR');
  }

  if (!response.ok) {
    const error = await readError(response);

    // 登录态失效时通知 AuthProvider 清理本地状态。
    if (response.status === 401 && !AUTH_PROBE_PATHS.has(path)) {
      window.dispatchEvent(new CustomEvent('ffm:auth-expired'));
    }

    throw new ApiRequestError(error.message, response.status, error.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** 认证与账号管理接口集合，类型统一来自 @repo/contracts。 */
export const api = {
  login(payload: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST' });
  },

  me(): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/me');
  },

  listAccounts(): Promise<Account[]> {
    return request<Account[]>('/accounts');
  },

  createAccount(payload: CreateAccountRequest): Promise<Account> {
    return request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAccount(id: string, payload: UpdateAccountRequest): Promise<Account> {
    return request<Account>(`/accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteAccount(id: string): Promise<void> {
    return request<void>(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  listFeatures(): Promise<FeatureItem[]> {
    return request<FeatureItem[]>('/features');
  },

  createFeature(payload: CreateFeatureRequest): Promise<FeatureItem> {
    return request<FeatureItem>('/features', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateFeature(id: string, payload: UpdateFeatureRequest): Promise<FeatureItem> {
    return request<FeatureItem>(`/features/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteFeature(id: string): Promise<void> {
    return request<void>(`/features/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
