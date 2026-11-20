import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FEATURE_KINDS } from '@repo/contracts';
import type { FeatureItem, FeatureKind } from '@repo/contracts';

/** 创建或修改功能条目时由路由层传入的已校验字段。 */
export interface FeatureInput {
  name: string;
  description: string;
  kind: FeatureKind;
  url: string;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function isFeatureKind(value: unknown): value is FeatureKind {
  return typeof value === 'string' && (FEATURE_KINDS as readonly string[]).includes(value);
}

function isFeatureItem(value: unknown): value is FeatureItem {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.description === 'string' &&
    isFeatureKind(record.kind) &&
    typeof record.url === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  );
}

function parseFeatures(raw: string): FeatureItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('功能数据文件不是合法的 JSON，请检查 apps/server/data/features.json');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('功能数据文件格式不正确，应为数组');
  }
  return parsed.map((item) => {
    if (!isFeatureItem(item)) {
      throw new Error('功能数据文件存在非法记录');
    }
    return { ...item };
  });
}

/**
 * JSON 文件功能仓库：内存维护功能列表，写操作串行执行并采用「临时文件 + rename」原子落盘。
 */
export class FeatureStore {
  private readonly dataDir: string;
  private readonly filePath: string;
  private features: FeatureItem[] = [];
  /** 写操作队列，保证并发写入不会互相覆盖。 */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'features.json');
  }

  /** 建目录，并在功能文件缺失时初始化为空数组。 */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.features = parseFeatures(raw);
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) {
        throw error;
      }
      this.features = [];
      await this.writeAtomic();
    }
  }

  list(): FeatureItem[] {
    return this.features.map((feature) => ({ ...feature }));
  }

  findById(id: string): FeatureItem | undefined {
    const feature = this.features.find((item) => item.id === id);
    return feature ? { ...feature } : undefined;
  }

  create(input: FeatureInput): Promise<FeatureItem> {
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const feature: FeatureItem = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        kind: input.kind,
        url: input.url,
        createdAt: now,
        updatedAt: now,
      };
      this.features = [...this.features, feature];
      await this.writeAtomic();
      return { ...feature };
    });
  }

  /** 更新功能条目；条目不存在返回 null。 */
  update(id: string, changes: Partial<FeatureInput>): Promise<FeatureItem | null> {
    return this.enqueue(async () => {
      const index = this.features.findIndex((item) => item.id === id);
      const current = index === -1 ? undefined : this.features[index];
      if (!current) return null;

      const updated: FeatureItem = {
        ...current,
        ...changes,
        updatedAt: new Date().toISOString(),
      };
      this.features = this.features.map((item, itemIndex) =>
        itemIndex === index ? updated : item,
      );
      await this.writeAtomic();
      return { ...updated };
    });
  }

  /** 删除功能条目；条目不存在返回 false。 */
  remove(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const existed = this.features.some((item) => item.id === id);
      if (!existed) return false;
      this.features = this.features.filter((item) => item.id !== id);
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
    await writeFile(tempPath, `${JSON.stringify(this.features, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }
}
