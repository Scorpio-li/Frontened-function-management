import { useEffect, useState } from 'react';

import type { EffectCategory, EffectType } from './types';
import { UNCATEGORIZED_NAME, toCategoryIdParam } from './types';

// ---------------------------------------------------------------------------
// API 请求
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  code?: string;
  message?: string;
  user?: T;
}

/** 带登录态的 fetch 封装；非 2xx 抛出带 status 的 Error。 */
export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as unknown as T;
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok) {
    const err = new Error(body.message ?? `请求失败 (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// 当前用户
// ---------------------------------------------------------------------------

export interface CurrentUser {
  role: 'admin' | 'viewer';
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ user?: CurrentUser }>('/api/auth/me')
      .then((data) => {
        if (cancelled) return;
        const role = data && typeof data === 'object' ? data.user?.role : undefined;
        if (role) setUser({ role });
      })
      .catch(() => {
        /* 静默失败，按 viewer 渲染 */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

// ---------------------------------------------------------------------------
// 分类数据 & 侧边栏导航
// ---------------------------------------------------------------------------

/** 分类数据变更后广播该事件，侧边栏子菜单据此重新拉取。 */
export const CATEGORIES_CHANGED_EVENT = 'css-effect:categories-changed';

export function notifyCategoriesChanged(): void {
  window.dispatchEvent(new Event(CATEGORIES_CHANGED_EVENT));
}

/** 侧边栏导航项。 */
export interface CategoryNavItem {
  label: string;
  to: string;
  /** 该分类下的效果数量，未分类时为空。 */
  count?: number;
}

/** 拉取分类列表（保持后端返回顺序）。 */
export function useCategories(): {
  categories: EffectCategory[];
  loading: boolean;
  reload: () => void;
} {
  const [categories, setCategories] = useState<EffectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<EffectCategory[]>('/api/css-effects/categories')
      .then((data) => {
        if (cancelled) return;
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    const onChanged = () => setVersion((value) => value + 1);
    window.addEventListener(CATEGORIES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CATEGORIES_CHANGED_EVENT, onChanged);
  }, []);

  return { categories, loading, reload: () => setVersion((value) => value + 1) };
}

/**
 * 侧边栏「CSS 效果」分组下的动态子菜单：
 * 未分类 + 各分类，点击进入对应分类的效果页。
 */
export function useCategoryNavItems(): CategoryNavItem[] {
  const { categories } = useCategories();

  return [
    { label: UNCATEGORIZED_NAME, to: `/css-effect/category/${toCategoryIdParam(null)}` },
    ...categories.map((category) => ({
      label: category.name,
      to: `/css-effect/category/${toCategoryIdParam(category.id)}`,
    })),
  ];
}

// ---------------------------------------------------------------------------
// 图片素材
// ---------------------------------------------------------------------------

/** 效果图片素材。url 可直接用于 HTML / CSS。 */
export interface EffectAsset {
  name: string;
  url: string;
  size: number;
  createdAt: string;
}

/** 单张图片素材大小上限，与后端保持一致。 */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 拉取已上传的图片素材列表（按上传时间倒序）。 */
export async function fetchEffectAssets(): Promise<EffectAsset[]> {
  const data = await apiFetch<EffectAsset[]>('/api/css-effects/assets');
  return Array.isArray(data) ? data : [];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 上传图片素材，返回可直接写进代码的素材信息。 */
export async function uploadEffectAsset(file: File): Promise<EffectAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  return apiFetch<EffectAsset>('/api/css-effects/assets', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
}

// ---------------------------------------------------------------------------
// Tag 颜色生成（基于字符串 hash，稳定且彩色）
// ---------------------------------------------------------------------------

const TAG_PALETTE = [
  { bg: '#eff6ff', text: '#1d4ed8' },
  { bg: '#f0fdf4', text: '#15803d' },
  { bg: '#fef2f2', text: '#b91c1c' },
  { bg: '#fffbeb', text: '#b45309' },
  { bg: '#fdf4ff', text: '#a21caf' },
  { bg: '#ecfeff', text: '#0e7490' },
  { bg: '#f5f3ff', text: '#6d28d9' },
  { bg: '#fff7ed', text: '#c2410c' },
];

export function tagStyle(tag: string): { backgroundColor: string; color: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  const palette = TAG_PALETTE[hash % TAG_PALETTE.length] as (typeof TAG_PALETTE)[number];
  return { backgroundColor: palette.bg, color: palette.text };
}

export const EFFECT_TYPE_LABEL: Record<EffectType, { label: string; bg: string; text: string }> = {
  css: { label: 'CSS', bg: '#eff6ff', text: '#1d4ed8' },
  animation: { label: '动画', bg: '#fef2f2', text: '#b91c1c' },
  echarts: { label: 'ECharts', bg: '#f0fdf4', text: '#15803d' },
};

// ---------------------------------------------------------------------------
// 通用类型与工具
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
