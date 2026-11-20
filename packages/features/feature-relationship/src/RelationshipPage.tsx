import { useState } from 'react';
import type { FormEvent } from 'react';

import { Badge, Button, Card, PageHeader } from '@repo/ui';
import relationship from 'relationship-ts';

type QueryMode = 'default' | 'reverse' | 'chain' | 'pair' | 'natural';
type Sex = -1 | 0 | 1;

interface ModeOption {
  value: QueryMode;
  label: string;
  hint: string;
  example: string;
}

const MODES: ModeOption[] = [
  {
    value: 'default',
    label: '称谓查询',
    hint: '输入用「的」连接的亲属关系，查询对应称谓。',
    example: '妈妈的妈妈的哥哥',
  },
  {
    value: 'reverse',
    label: '反向查询',
    hint: '输入对方的称谓，查询对方如何称呼我。',
    example: '外婆',
  },
  {
    value: 'chain',
    label: '关系链',
    hint: '输入一个称谓，反查它代表的完整关系链。',
    example: '舅公',
  },
  {
    value: 'pair',
    label: '关系合称',
    hint: '输入两个称谓，查询两个人之间的关系合称。',
    example: '外婆',
  },
  {
    value: 'natural',
    label: '自然语言',
    hint: '直接输入自然语言问句，例如「爸爸的妈妈是谁？」。',
    example: '舅妈如何称呼外婆？',
  },
];

const DEFAULT_MODE: ModeOption = {
  value: 'default',
  label: '称谓查询',
  hint: '输入用「的」连接的亲属关系，查询对应称谓。',
  example: '爸爸的妈妈',
};

const SEX_OPTIONS: Array<{ value: Sex; label: string }> = [
  { value: -1, label: '不确定' },
  { value: 1, label: '男' },
  { value: 0, label: '女' },
];

export function RelationshipPage() {
  const [mode, setMode] = useState<QueryMode>('default');
  const [text, setText] = useState('爸爸的妈妈');
  const [target, setTarget] = useState('奶奶');
  const [sex, setSex] = useState<Sex>(1);
  const [results, setResults] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeMode = MODES.find((item) => item.value === mode) ?? DEFAULT_MODE;

  function switchMode(next: ModeOption): void {
    setMode(next.value);
    setText(next.example);
    setResults(null);
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const trimmedText = text.trim();
    if (!trimmedText) {
      setResults(null);
      setError('请输入称谓或问句');
      return;
    }

    const trimmedTarget = target.trim();
    if (mode === 'pair' && !trimmedTarget) {
      setResults(null);
      setError('关系合称需要同时输入两个称谓');
      return;
    }

    try {
      let output: string[];

      if (mode === 'natural') {
        output = relationship(trimmedText);
      } else if (mode === 'pair') {
        output = relationship({ text: trimmedText, target: trimmedTarget, type: 'pair' });
      } else if (mode === 'chain') {
        output = relationship({ text: trimmedText, type: 'chain' });
      } else if (mode === 'reverse') {
        output = relationship({ text: trimmedText, reverse: true, sex });
      } else {
        output = relationship({ text: trimmedText });
      }

      setResults(output);
      setError(output.length === 0 ? '未找到对应的关系，请检查输入是否符合称谓格式' : null);
    } catch {
      setResults(null);
      setError('计算失败，请检查输入是否符合称谓格式');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="中文亲戚关系计算器"
        description="基于 relationship-ts 的中文亲属称谓 demo，支持称谓查询、反向查询、关系链、关系合称与自然语言。"
      />

      <Card title="计算方式" description={activeMode.hint}>
        <div className="form-inline">
          {MODES.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={item.value === mode ? 'primary' : 'secondary'}
              onClick={() => switchMode(item)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <form className="form-inline" onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <label className="form-field" htmlFor="relationship-text" style={{ flex: '1 1 260px' }}>
            <span>称谓 / 问句</span>
            <input
              id="relationship-text"
              value={text}
              autoComplete="off"
              placeholder={activeMode.example}
              onChange={(event) => setText(event.target.value)}
            />
          </label>

          {mode === 'pair' ? (
            <label
              className="form-field"
              htmlFor="relationship-target"
              style={{ flex: '1 1 200px' }}
            >
              <span>相对称谓</span>
              <input
                id="relationship-target"
                value={target}
                autoComplete="off"
                placeholder="奶奶"
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
          ) : null}

          <Button type="submit">计算</Button>
        </form>

        {mode === 'reverse' ? (
          <div className="form-inline" style={{ marginTop: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--ffm-color-muted)' }}>本人性别：</span>
            {SEX_OPTIONS.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={item.value === sex ? 'primary' : 'secondary'}
                onClick={() => setSex(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        ) : null}
      </Card>

      <div style={{ marginTop: 20 }}>
        <Card title="计算结果">
          {error !== null ? <p className="form-error">{error}</p> : null}

          {error === null && results === null ? (
            <p className="form-hint">输入称谓后点击「计算」查看结果。</p>
          ) : null}

          {results !== null && results.length > 0 ? (
            <div className="form-inline">
              {results.map((item) => (
                <Badge key={item} tone="info">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Card title="关于 relationship-ts" description="中文亲戚关系计算器的 TypeScript 重构版本。">
          <p className="form-hint">
            使用 Map 与 LRU 缓存优化查询性能，支持完整 TypeScript 类型、方言模式与 React Native。
          </p>
          <p className="form-hint">
            参考文档：
            <a
              href="https://github.com/ExploringTheCodeWorld/relationship-ts"
              target="_blank"
              rel="noreferrer"
            >
              GitHub 仓库
            </a>
            <span> · </span>
            <a href="https://docs.qinyimo.cn/" target="_blank" rel="noreferrer">
              在线文档
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
