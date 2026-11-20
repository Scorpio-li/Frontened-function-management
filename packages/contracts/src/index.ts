/** 账号角色：admin 为内置唯一管理员，viewer 为只读查看者。 */
export type Role = 'admin' | 'viewer';

/** 内置管理员用户名（仅用于展示与保护判断，密码只存在本地环境变量）。 */
export const ADMIN_USERNAME = 'admin';

/** 对外返回的账号信息，绝不包含密码或哈希字段。 */
export interface Account {
  id: string;
  username: string;
  role: Role;
  createdAt: string; // ISO 字符串
  updatedAt: string; // ISO 字符串
}

/** 当前登录用户与账号信息同构。 */
export type CurrentUser = Account;

export interface LoginRequest {
  username: string;
  password: string;
}

/** 登录与获取当前用户统一的响应结构。 */
export interface AuthResponse {
  user: CurrentUser;
}

export interface CreateAccountRequest {
  username: string;
  password: string;
}

/** 用户名与密码均可选，但不能同时为空。 */
export interface UpdateAccountRequest {
  username?: string;
  password?: string;
}

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'CONFIG_ERROR';

/** 统一错误响应体。 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

/** 用户名规则：3–32 位小写字母、数字、下划线或连字符。 */
export const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
/** 密码最小长度。 */
export const PASSWORD_MIN_LENGTH = 8;
