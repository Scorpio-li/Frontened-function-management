import { useEffect, useRef, useState } from 'react';

import { Infographic } from '@antv/infographic';
import { Button, Card, PageHeader } from '@repo/ui';

const DEFAULT_SYNTAX = `infographic list-row-simple-horizontal-arrow
data
  title 功能接入流程
  lists
    - label 需求分析
      desc 明确目标与范围
    - label 方案设计
      desc 技术选型与拆解
    - label 开发联调
      desc 编码、自测与联调
    - label 发布上线
      desc 验收、监控与复盘`;

export function InfographicPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<Infographic | null>(null);
  const [syntax, setSyntax] = useState(DEFAULT_SYNTAX);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const infographic = new Infographic({
      container,
      width: '100%',
      height: 460,
    });
    instanceRef.current = infographic;

    try {
      infographic.render(DEFAULT_SYNTAX);
    } catch {
      setError('默认信息图渲染失败，请检查语法。');
    }

    return () => {
      instanceRef.current = null;
      infographic.destroy();
    };
  }, []);

  function handleRender(): void {
    const infographic = instanceRef.current;
    if (!infographic) return;

    try {
      infographic.render(syntax);
      setError(null);
    } catch {
      setError('渲染失败，请检查声明式语法是否正确。');
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="声明式信息图"
        description="基于 @antv/infographic，通过一段声明式语法描述数据、结构与主题，自动生成信息图。"
      />

      <Card title="信息图预览" description="修改下方语法后点击「重新渲染」，即可实时更新信息图。">
        {error !== null ? <p className="form-error">{error}</p> : null}
        <div ref={containerRef} style={{ width: '100%', minHeight: 460 }} />
      </Card>

      <div style={{ marginTop: 20 }}>
        <Card title="声明式语法">
          <textarea
            value={syntax}
            rows={12}
            spellCheck={false}
            onChange={(event) => setSyntax(event.target.value)}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--ffm-color-border)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              resize: 'vertical',
            }}
          />
          <div className="form-inline" style={{ marginTop: 12 }}>
            <Button size="sm" onClick={handleRender}>
              重新渲染
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSyntax(DEFAULT_SYNTAX);
                handleRender();
              }}
            >
              恢复示例
            </Button>
          </div>
          <p className="form-hint" style={{ marginTop: 10 }}>
            语法参考：
            <a href="https://infographic.antv.vision/learn" target="_blank" rel="noreferrer">
              AntV Infographic 文档
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
