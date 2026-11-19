import { resolve } from 'node:path';
import { ADMIN_USERNAME } from '@repo/contracts';

/** 服务运行配置，全部来自环境变量。 */
export interface ServerConfig {
  host: string;
  port: number;
  adminUsername: string;
  adminPassword: string;
  dataDir: string;
  sessionTtlMs: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_DATA_DIR = 'data';
const DEFAULT_SESSION_TTL_HOURS = 8;

function readPositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数`);
  }
  return value;
}

function readPositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`环境变量 ${name} 必须是正数`);
  }
  return value;
}

/** 读取并校验环境变量，缺少管理员密码时直接抛错阻止启动。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const adminPassword = env.FFM_ADMIN_PASSWORD ?? '';
  if (adminPassword.trim() === '') {
    throw new Error(
      '缺少 FFM_ADMIN_PASSWORD 环境变量，请在 apps/server/.env.local 中配置本地管理员密码',
    );
  }

  const adminUsername = (env.FFM_ADMIN_USERNAME?.trim() || ADMIN_USERNAME).toLowerCase();
  const host = env.FFM_HOST?.trim() || DEFAULT_HOST;
  const port = readPositiveInteger(env.FFM_PORT, DEFAULT_PORT, 'FFM_PORT');
  const dataDir = resolve(process.cwd(), env.FFM_DATA_DIR?.trim() || DEFAULT_DATA_DIR);
  const ttlHours = readPositiveNumber(
    env.FFM_SESSION_TTL_HOURS,
    DEFAULT_SESSION_TTL_HOURS,
    'FFM_SESSION_TTL_HOURS',
  );

  return {
    host,
    port,
    adminUsername,
    adminPassword,
    dataDir,
    sessionTtlMs: Math.round(ttlHours * 60 * 60 * 1000),
  };
}
