import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Account } from '@repo/contracts';

/** 落盘的账号记录，仅在存储与内部逻辑中出现，绝不直接返回给客户端。 */
export interface StoredAccount extends Account {
  passwordHash: string;
}

/** 用户名冲突错误，供路由层转换为 409。 */
export class DuplicateUsernameError extends Error {
  constructor() {
    super('用户名已存在');
    this.name = 'DuplicateUsernameError';
  }
}

/** 统一用户名写法：去首尾空格并转小写。 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.username === 'string' &&
    (record.role === 'admin' || record.role === 'viewer') &&
    typeof record.passwordHash === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

function parseAccounts(raw: string): StoredAccount[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('账号数据文件不是合法的 JSON，请检查 apps/server/data/accounts.json');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('账号数据文件格式不正确，应为数组');
  }
  return parsed.map((item) => {
    if (!isStoredAccount(item)) {
      throw new Error('账号数据文件存在非法记录');
    }
    return { ...item, username: normalizeUsername(item.username) };
  });
}

/**
 * JSON 文件账号仓库：内存维护账号列表，写操作串行执行并采用「临时文件 + rename」原子落盘。
 * 文件只保存 viewer 账号，内置管理员由环境变量合成。
 */
export class AccountStore {
  private readonly dataDir: string;
  private readonly filePath: string;
  private accounts: StoredAccount[] = [];
  /** 写操作队列，保证并发写入不会互相覆盖。 */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'accounts.json');
  }

  /** 建目录，并在账号文件缺失时初始化为空数组。 */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.accounts = parseAccounts(raw);
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) {
        throw error;
      }
      this.accounts = [];
      await this.writeAtomic();
    }
  }

  list(): StoredAccount[] {
    return this.accounts.map((account) => ({ ...account }));
  }

  findById(id: string): StoredAccount | undefined {
    const account = this.accounts.find((item) => item.id === id);
    return account ? { ...account } : undefined;
  }

  findByUsername(username: string): StoredAccount | undefined {
    const normalized = normalizeUsername(username);
    const account = this.accounts.find((item) => item.username === normalized);
    return account ? { ...account } : undefined;
  }

  /** 创建 viewer 账号；用户名重复时抛出 DuplicateUsernameError。 */
  create(input: { username: string; passwordHash: string }): Promise<StoredAccount> {
    return this.enqueue(async () => {
      const username = normalizeUsername(input.username);
      if (this.accounts.some((item) => item.username === username)) {
        throw new DuplicateUsernameError();
      }
      const now = new Date().toISOString();
      const account: StoredAccount = {
        id: randomUUID(),
        username,
        role: 'viewer',
        passwordHash: input.passwordHash,
        createdAt: now,
        updatedAt: now,
      };
      this.accounts = [...this.accounts, account];
      await this.writeAtomic();
      return { ...account };
    });
  }

  /** 更新用户名或密码哈希；账号不存在返回 null，用户名冲突抛出 DuplicateUsernameError。 */
  update(
    id: string,
    changes: { username?: string; passwordHash?: string },
  ): Promise<StoredAccount | null> {
    return this.enqueue(async () => {
      const index = this.accounts.findIndex((item) => item.id === id);
      const current = index === -1 ? undefined : this.accounts[index];
      if (!current) return null;

      const username =
        changes.username === undefined ? current.username : normalizeUsername(changes.username);
      const hasConflict = this.accounts.some(
        (item) => item.id !== id && item.username === username,
      );
      if (username !== current.username && hasConflict) {
        throw new DuplicateUsernameError();
      }

      const updated: StoredAccount = {
        ...current,
        username,
        passwordHash: changes.passwordHash ?? current.passwordHash,
        updatedAt: new Date().toISOString(),
      };
      this.accounts = this.accounts.map((item, itemIndex) =>
        itemIndex === index ? updated : item,
      );
      await this.writeAtomic();
      return { ...updated };
    });
  }

  /** 删除账号；账号不存在返回 false。 */
  remove(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const existed = this.accounts.some((item) => item.id === id);
      if (!existed) return false;
      this.accounts = this.accounts.filter((item) => item.id !== id);
      await this.writeAtomic();
      return true;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async writeAtomic(): Promise<void> {
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.accounts, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }
}
