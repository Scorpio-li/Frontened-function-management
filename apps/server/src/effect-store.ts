import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 效果类型。 */
export type EffectType = 'css' | 'animation' | 'echarts';

/** 分类。 */
export interface EffectCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** 效果。categoryId = null 表示未分类。 */
export interface CssEffect {
  id: string;
  categoryId: string | null;
  name: string;
  description?: string;
  effectType: EffectType;
  tags: string[];
  html?: string;
  css?: string;
  js?: string;
  echartsOption?: unknown;
  createdAt: string;
  updatedAt: string;
}

/** EffectStore 落盘的整体结构。 */
interface EffectDataFile {
  categories: EffectCategory[];
  effects: CssEffect[];
}

/** 分类名冲突错误。 */
export class DuplicateCategoryError extends Error {
  constructor() {
    super('分类名称已存在');
    this.name = 'DuplicateCategoryError';
  }
}

/** 种子数据：后端首次启动且文件不存在时写入。 */
function buildSeedData(): EffectDataFile {
  const now = new Date().toISOString();
  const categories: EffectCategory[] = [
    {
      id: 'cat-css',
      name: '基础 CSS',
      description: '纯 CSS 实现的视觉效果',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat-animation',
      name: 'CSS 动画',
      description: '关键帧、过渡、变形等动画效果',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat-echarts',
      name: 'ECharts 可视化',
      description: '数据可视化图表效果',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const effects: CssEffect[] = [
    // —— 基础 CSS ——
    {
      id: 'eff-breathing',
      categoryId: 'cat-css',
      name: '呼吸动画',
      description: '使用 box-shadow + animation 实现柔和呼吸光晕',
      effectType: 'css',
      tags: ['动画', '光晕', '柔和'],
      html: '<div class="breathing"></div>',
      css: `.breathing {
  width: 80px;
  height: 80px;
  margin: 40px auto;
  border-radius: 50%;
  background: linear-gradient(135deg, #5c78ff, #3b5bfd);
  animation: breathing 2.5s ease-in-out infinite;
}
@keyframes breathing {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59,91,253, 0.45); }
  50%      { box-shadow: 0 0 0 30px rgba(59,91,253, 0); }
}`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'eff-gradient-border',
      categoryId: 'cat-css',
      name: '渐变边框按钮',
      description: '使用 conic-gradient + padding + border-radius 实现的渐变边框效果',
      effectType: 'css',
      tags: ['边框', '按钮', '渐变'],
      html: '<button class="gradient-btn">Hover Me</button>',
      css: `.gradient-btn {
  position: relative;
  padding: 12px 28px;
  border-radius: 10px;
  border: none;
  background: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.gradient-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  padding: 2px;
  background: conic-gradient(from 0deg, #5c78ff, #22c55e, #f59e0b, #ef4444, #5c78ff);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0.85;
}
.gradient-btn:hover::before { opacity: 1; }`,
      createdAt: now,
      updatedAt: now,
    },
    // —— CSS 动画 ——
    {
      id: 'eff-card-hover',
      categoryId: 'cat-animation',
      name: '卡片悬浮提升',
      description: '鼠标悬停时卡片抬升 + 阴影加深 + 轻微旋转',
      effectType: 'animation',
      tags: ['悬浮', '卡片', '交互'],
      html: '<div class="hover-card"><div class="hover-card__inner">卡片标题</div></div>',
      css: `.hover-card {
  width: 200px;
  height: 120px;
  margin: 20px auto;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0f4ff, #ffffff);
  box-shadow: 0 2px 10px rgba(16,23,40,0.06);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  cursor: pointer;
}
.hover-card:hover {
  transform: translateY(-6px) rotate(-0.8deg);
  box-shadow: 0 12px 30px rgba(59,91,253,0.18);
}
.hover-card__inner {
  padding: 16px;
  font-weight: 600;
  color: #1f2937;
}`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'eff-spinner',
      categoryId: 'cat-animation',
      name: '加载 Spinner',
      description: '三圆点跳动 + 旋转外圈的组合 loading 动画',
      effectType: 'animation',
      tags: ['加载', '动画', 'Spinner'],
      html: '<div class="spinner"><span></span><span></span><span></span></div>',
      css: `.spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 24px;
}
.spinner span {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #3b5bfd;
  animation: spinner-bounce 1.2s ease-in-out infinite;
}
.spinner span:nth-child(1) { animation-delay: 0s; }
.spinner span:nth-child(2) { animation-delay: 0.15s; }
.spinner span:nth-child(3) { animation-delay: 0.3s; }
@keyframes spinner-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40%           { transform: scale(1);   opacity: 1;   }
}`,
      createdAt: now,
      updatedAt: now,
    },
    // —— ECharts ——
    {
      id: 'eff-echarts-line',
      categoryId: 'cat-echarts',
      name: '折线图',
      description: '基础 ECharts 折线图，展示数据趋势',
      effectType: 'echarts',
      tags: ['图表', '折线图', '数据可视化'],
      html: '<div id="echarts-container" style="width:100%;height:300px"></div>',
      js: `const chart = echarts.init(document.getElementById('echarts-container'));
chart.setOption(option);
window.addEventListener('resize', () => chart.resize());`,
      echartsOption: {
        title: { text: '月访问量趋势', left: 'center' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'] },
        yAxis: { type: 'value' },
        series: [
          {
            name: '访问量',
            type: 'line',
            smooth: true,
            data: [320, 482, 501, 634, 890, 930],
            itemStyle: { color: '#3b5bfd' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(59,91,253,0.35)' },
                  { offset: 1, color: 'rgba(59,91,253,0.02)' },
                ],
              },
            },
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'eff-echarts-pie',
      categoryId: 'cat-echarts',
      name: '环形图',
      description: 'ECharts 环形饼图，展示占比分布',
      effectType: 'echarts',
      tags: ['图表', '饼图', '占比'],
      html: '<div id="echarts-pie" style="width:100%;height:280px"></div>',
      js: `const chart = echarts.init(document.getElementById('echarts-pie'));
chart.setOption(option);
window.addEventListener('resize', () => chart.resize());`,
      echartsOption: {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0 },
        series: [
          {
            name: '设备占比',
            type: 'pie',
            radius: ['45%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            data: [
              { value: 58, name: 'PC', itemStyle: { color: '#3b5bfd' } },
              { value: 27, name: '移动端', itemStyle: { color: '#22c55e' } },
              { value: 15, name: '平板', itemStyle: { color: '#f59e0b' } },
            ],
          },
        ],
      },
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { categories, effects };
}

// —— 辅助函数 ——
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function isValidCategoryName(name: string): boolean {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 32;
}

function isValidEffectName(name: string): boolean {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 64;
}

/**
 * 效果仓库：JSON 文件 + 写队列 + 原子 rename 落盘。
 * 不做数据库，效果量 < 500 条足够。
 */
export class EffectStore {
  private readonly dataDir: string;
  private readonly filePath: string;
  private categories: EffectCategory[] = [];
  private effects: CssEffect[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, 'css-effects.json');
  }

  /** 目录初始化 + 首次启动写入种子数据。 */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as EffectDataFile;
      this.categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      this.effects = Array.isArray(parsed.effects) ? parsed.effects : [];
    } catch (error) {
      if (!(isNodeError(error) && error.code === 'ENOENT')) {
        throw error;
      }
      const seed = buildSeedData();
      this.categories = seed.categories;
      this.effects = seed.effects;
      await this.writeAtomic();
    }
  }

  // —— 分类 ——
  listCategories(): EffectCategory[] {
    return this.categories.map((c) => ({ ...c }));
  }

  findCategoryById(id: string): EffectCategory | undefined {
    return this.categories.find((c) => c.id === id);
  }

  async createCategory(input: { name: string; description?: string }): Promise<EffectCategory> {
    if (!isValidCategoryName(input.name)) {
      throw new Error('分类名称需 1–32 字符');
    }
    if (this.categories.some((c) => c.name === input.name.trim())) {
      throw new DuplicateCategoryError();
    }
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const cat: EffectCategory = {
        id: randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      this.categories = [...this.categories, cat];
      await this.writeAtomic();
      return { ...cat };
    });
  }

  async updateCategory(
    id: string,
    changes: { name?: string; description?: string },
  ): Promise<EffectCategory | null> {
    return this.enqueue(async () => {
      const idx = this.categories.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      const current = this.categories[idx] as EffectCategory;

      let name = current.name;
      if (changes.name !== undefined) {
        if (!isValidCategoryName(changes.name)) throw new Error('分类名称需 1–32 字符');
        const trimmed = changes.name.trim();
        const conflict = this.categories.some((c) => c.id !== id && c.name === trimmed);
        if (conflict) throw new DuplicateCategoryError();
        name = trimmed;
      }

      const updated: EffectCategory = {
        ...current,
        name,
        description:
          changes.description !== undefined
            ? changes.description.trim() || undefined
            : current.description,
        updatedAt: new Date().toISOString(),
      };
      this.categories = this.categories.map((c, i) => (i === idx ? updated : c));
      await this.writeAtomic();
      return { ...updated };
    });
  }

  /**
   * 删除分类。关键安全逻辑：该分类下所有效果自动归为未分类（categoryId = null），
   * **永不删除效果本身**。返回 false 表示分类不存在。
   */
  async deleteCategory(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const existed = this.categories.some((c) => c.id === id);
      if (!existed) return false;

      this.categories = this.categories.filter((c) => c.id !== id);
      const now = new Date().toISOString();
      this.effects = this.effects.map((e) =>
        e.categoryId === id ? { ...e, categoryId: null, updatedAt: now } : e,
      );
      await this.writeAtomic();
      return true;
    });
  }

  // —— 效果 ——
  listEffects(filter?: { categoryId?: string | null; type?: EffectType; q?: string }): CssEffect[] {
    let result = this.effects;
    if (filter?.categoryId !== undefined) {
      result = result.filter((e) => e.categoryId === filter.categoryId);
    }
    if (filter?.type) {
      result = result.filter((e) => e.effectType === filter.type);
    }
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.description?.toLowerCase().includes(q) ?? false) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    // 上限
    return result.slice(0, 200).map((e) => ({ ...e, tags: [...e.tags] }));
  }

  findEffectById(id: string): CssEffect | undefined {
    const e = this.effects.find((eff) => eff.id === id);
    return e ? { ...e, tags: [...e.tags] } : undefined;
  }

  async createEffect(input: {
    categoryId: string | null;
    name: string;
    description?: string;
    effectType: EffectType;
    tags?: string[];
    html?: string;
    css?: string;
    js?: string;
    echartsOption?: unknown;
  }): Promise<CssEffect> {
    if (!isValidEffectName(input.name)) throw new Error('效果名称需 1–64 字符');
    if (input.categoryId && !this.categories.some((c) => c.id === input.categoryId)) {
      throw new Error('所属分类不存在');
    }
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const effect: CssEffect = {
        id: randomUUID(),
        categoryId: input.categoryId || null,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        effectType: input.effectType,
        tags: (input.tags || []).map((t) => t.trim()).filter(Boolean),
        html: input.html,
        css: input.css,
        js: input.js,
        echartsOption: input.echartsOption,
        createdAt: now,
        updatedAt: now,
      };
      this.effects = [...this.effects, effect];
      await this.writeAtomic();
      return { ...effect, tags: [...effect.tags] };
    });
  }

  async updateEffect(
    id: string,
    changes: Partial<Omit<CssEffect, 'id' | 'createdAt'>>,
  ): Promise<CssEffect | null> {
    return this.enqueue(async () => {
      const idx = this.effects.findIndex((e) => e.id === id);
      if (idx === -1) return null;
      const current = this.effects[idx] as CssEffect;

      const newCategoryId = changes.categoryId;
      if (newCategoryId !== undefined && newCategoryId !== null) {
        if (!this.categories.some((c) => c.id === newCategoryId)) throw new Error('所属分类不存在');
      }

      let name = current.name;
      if (changes.name !== undefined) {
        if (!isValidEffectName(changes.name)) throw new Error('效果名称需 1–64 字符');
        name = changes.name.trim();
      }

      const updated: CssEffect = {
        ...current,
        name,
        categoryId: newCategoryId ?? current.categoryId,
        description:
          changes.description !== undefined
            ? changes.description?.trim() || undefined
            : current.description,
        effectType: changes.effectType ?? current.effectType,
        tags:
          changes.tags !== undefined
            ? changes.tags.map((t) => t.trim()).filter(Boolean)
            : current.tags,
        html: changes.html !== undefined ? changes.html : current.html,
        css: changes.css !== undefined ? changes.css : current.css,
        js: changes.js !== undefined ? changes.js : current.js,
        echartsOption:
          changes.echartsOption !== undefined ? changes.echartsOption : current.echartsOption,
        updatedAt: new Date().toISOString(),
      };
      this.effects = this.effects.map((e, i) => (i === idx ? updated : e));
      await this.writeAtomic();
      return { ...updated, tags: [...updated.tags] };
    });
  }

  async deleteEffect(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const existed = this.effects.some((e) => e.id === id);
      if (!existed) return false;
      this.effects = this.effects.filter((e) => e.id !== id);
      await this.writeAtomic();
      return true;
    });
  }

  async batchMoveEffects(effectIds: string[], targetCategoryId: string | null): Promise<number> {
    if (targetCategoryId !== null && !this.categories.some((c) => c.id === targetCategoryId)) {
      throw new Error('目标分类不存在');
    }
    return this.enqueue(async () => {
      const idSet = new Set(effectIds);
      let moved = 0;
      const now = new Date().toISOString();
      this.effects = this.effects.map((e) => {
        if (idSet.has(e.id) && e.categoryId !== targetCategoryId) {
          moved++;
          return { ...e, categoryId: targetCategoryId, updatedAt: now };
        }
        return e;
      });
      await this.writeAtomic();
      return moved;
    });
  }

  // —— 内部 ——
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async writeAtomic(): Promise<void> {
    const data: EffectDataFile = { categories: this.categories, effects: this.effects };
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }
}
