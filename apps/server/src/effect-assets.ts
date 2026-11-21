import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 单张图片素材大小上限：5MB。 */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** 素材目录名，位于后端 dataDir 下（本地数据，不入库）。 */
const ASSET_DIR_NAME = 'css-effect-assets';
const INDEX_FILE_NAME = 'index.json';

/** 允许的图片类型 → 落盘扩展名。 */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** 扩展名 → 响应 Content-Type。 */
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** 只允许「UUID.扩展名」形式的文件名，防止路径穿越。 */
const FILE_NAME_PATTERN = /^[a-z0-9-]+\.(png|jpe?g|gif|webp)$/i;

/**
 * 素材归属的效果 id：真实效果 id 或新建时前端生成的 draft-xxx。
 * 限制字符集，避免被拼接进路径或污染索引。
 */
const EFFECT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

/** 素材元信息。url 为前端可直接引用的相对地址。 */
export interface EffectAsset {
  name: string;
  fileName: string;
  url: string;
  size: number;
  createdAt: string;
  effectId: string;
}

/** 索引中落盘的素材记录。 */
interface AssetRecord {
  name: string;
  fileName: string;
  size: number;
  createdAt: string;
  effectId: string;
}

interface AssetIndexFile {
  version: 1;
  assets: AssetRecord[];
}

function toPublicAsset(record: AssetRecord): EffectAsset {
  return {
    name: record.name,
    fileName: record.fileName,
    url: `/api/css-effects/assets/${record.name}`,
    size: record.size,
    createdAt: record.createdAt,
    effectId: record.effectId,
  };
}

function normalizeFileName(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/**
 * CSS 效果图片素材仓库：图片以文件形式存放在 dataDir/css-effect-assets 下，
 * 并通过 index.json 记录归属效果，避免不同效果的素材互相串用。
 */
export class EffectAssetStore {
  private readonly dir: string;
  private readonly indexPath: string;
  private records: AssetRecord[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dir = join(dataDir, ASSET_DIR_NAME);
    this.indexPath = join(this.dir, INDEX_FILE_NAME);
  }

  /** 创建素材目录并加载索引（幂等）。 */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as AssetIndexFile;
      this.records = Array.isArray(parsed.assets)
        ? parsed.assets.filter((item) => FILE_NAME_PATTERN.test(String(item?.name ?? '')))
        : [];
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) throw error;
      this.records = [];
    }
  }

  /** 接收 data URL，校验类型与大小后落盘，并记录归属效果。 */
  async save(input: {
    effectId: string;
    dataUrl: string;
    fileName?: string;
  }): Promise<EffectAsset> {
    this.assertEffectId(input.effectId);

    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(
      input.dataUrl.trim(),
    );
    if (!match) {
      throw new Error('仅支持 PNG / JPEG / GIF / WebP 的 base64 图片');
    }

    const mime = (match[1] ?? '').toLowerCase();
    const ext = MIME_TO_EXT[mime];
    if (!ext) {
      throw new Error('仅支持 PNG / JPEG / GIF / WebP 的 base64 图片');
    }

    const buffer = Buffer.from((match[2] ?? '').replace(/\s/g, ''), 'base64');
    if (buffer.length === 0) {
      throw new Error('图片内容为空');
    }
    if (buffer.length > MAX_ASSET_BYTES) {
      throw new Error('单张图片不能超过 5MB');
    }

    return this.enqueue(async () => {
      const name = `${randomUUID()}.${ext}`;
      await writeFile(join(this.dir, name), buffer);
      const record: AssetRecord = {
        name,
        fileName: normalizeFileName(input.fileName, name),
        size: buffer.length,
        createdAt: new Date().toISOString(),
        effectId: input.effectId,
      };
      this.records = [...this.records, record];
      await this.persist();
      return toPublicAsset(record);
    });
  }

  /** 列出某个效果下的素材，按上传时间倒序。 */
  async list(effectId: string): Promise<EffectAsset[]> {
    this.assertEffectId(effectId);
    return this.records
      .filter((record) => record.effectId === effectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toPublicAsset);
  }

  /** 重命名素材的展示名；不属于该效果时返回 null。 */
  async rename(name: string, effectId: string, fileName: string): Promise<EffectAsset | null> {
    this.assertEffectId(effectId);
    const trimmed = fileName.trim();
    if (!trimmed) throw new Error('素材名称不能为空');

    return this.enqueue(async () => {
      const index = this.records.findIndex(
        (record) => record.name === name && record.effectId === effectId,
      );
      if (index === -1) return null;
      const current = this.records[index] as AssetRecord;
      const updated: AssetRecord = { ...current, fileName: trimmed.slice(0, 80) };
      this.records = this.records.map((record, i) => (i === index ? updated : record));
      await this.persist();
      return toPublicAsset(updated);
    });
  }

  /** 删除素材文件与索引记录；不属于该效果时返回 false。 */
  async remove(name: string, effectId: string): Promise<boolean> {
    this.assertEffectId(effectId);
    if (!FILE_NAME_PATTERN.test(name)) return false;

    return this.enqueue(async () => {
      const target = this.records.find(
        (record) => record.name === name && record.effectId === effectId,
      );
      if (!target) return false;
      this.records = this.records.filter((record) => record !== target);
      await unlink(join(this.dir, name)).catch(() => undefined);
      await this.persist();
      return true;
    });
  }

  /** 删除某个效果的全部素材（删除效果时调用）。 */
  async removeByEffect(effectId: string): Promise<number> {
    if (!EFFECT_ID_PATTERN.test(effectId)) return 0;
    return this.enqueue(async () => {
      const targets = this.records.filter((record) => record.effectId === effectId);
      if (targets.length === 0) return 0;
      this.records = this.records.filter((record) => record.effectId !== effectId);
      await Promise.all(
        targets.map((record) => unlink(join(this.dir, record.name)).catch(() => undefined)),
      );
      await this.persist();
      return targets.length;
    });
  }

  /** 把草稿效果下的素材转移到真实效果 id（新建效果成功后调用）。 */
  async reassign(fromEffectId: string, toEffectId: string): Promise<number> {
    if (!EFFECT_ID_PATTERN.test(fromEffectId) || !EFFECT_ID_PATTERN.test(toEffectId)) return 0;
    if (fromEffectId === toEffectId) return 0;

    return this.enqueue(async () => {
      let moved = 0;
      this.records = this.records.map((record) => {
        if (record.effectId !== fromEffectId) return record;
        moved += 1;
        return { ...record, effectId: toEffectId };
      });
      if (moved > 0) await this.persist();
      return moved;
    });
  }

  /** 按文件名读取素材；文件名不合法或文件不存在时返回 null。 */
  async read(name: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!FILE_NAME_PATTERN.test(name)) return null;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const contentType = EXT_TO_MIME[ext];
    if (!contentType) return null;
    try {
      const buffer = await readFile(join(this.dir, name));
      return { buffer, contentType };
    } catch {
      return null;
    }
  }

  /** 校验 effectId 字符集，非法时直接抛错（接口返回 400）。 */
  private assertEffectId(effectId: string): void {
    if (!EFFECT_ID_PATTERN.test(effectId)) {
      throw new Error('effectId 格式不正确');
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** 原子写入索引文件。 */
  private async persist(): Promise<void> {
    const data: AssetIndexFile = { version: 1, assets: this.records };
    const tempPath = `${this.indexPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.indexPath);
  }
}
