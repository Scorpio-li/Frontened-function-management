import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 单张图片素材大小上限：5MB。 */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** 素材目录名，位于后端 dataDir 下（本地数据，不入库）。 */
const ASSET_DIR_NAME = 'css-effect-assets';

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

/** 素材元信息。url 为前端可直接引用的相对地址。 */
export interface EffectAsset {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

/**
 * CSS 效果图片素材仓库：图片以文件形式存放在 dataDir/css-effect-assets 下，
 * 效果代码里通过 url 引用，避免把 base64 塞进效果 JSON。
 */
export class EffectAssetStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, ASSET_DIR_NAME);
  }

  /** 创建素材目录（幂等）。 */
  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** 接收 data URL，校验类型与大小后落盘，返回可直接引用的素材信息。 */
  async save(dataUrl: string): Promise<EffectAsset> {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(
      dataUrl.trim(),
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

    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(this.dir, name), buffer);
    return {
      name,
      url: `/api/css-effects/assets/${name}`,
      size: buffer.length,
      createdAt: new Date().toISOString(),
    };
  }

  /** 列出全部素材，按上传时间倒序。 */
  async list(): Promise<EffectAsset[]> {
    const entries = await readdir(this.dir, { withFileTypes: true });
    const assets: EffectAsset[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !FILE_NAME_PATTERN.test(entry.name)) continue;
      const info = await stat(join(this.dir, entry.name)).catch(() => null);
      if (!info) continue;
      assets.push({
        name: entry.name,
        url: `/api/css-effects/assets/${entry.name}`,
        size: info.size,
        createdAt: info.mtime.toISOString(),
      });
    }
    return assets.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
}
