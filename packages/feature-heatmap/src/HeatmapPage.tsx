import { useEffect, useState } from 'react';

import { Button, Card, PageHeader } from '@repo/ui';
import 'jheat.js';
import 'jheat.js/dist/heat.js.css';

interface HeatJsApi {
  addDate(
    elementId: string,
    date: Date,
    trendType?: string | null,
    triggerUpdate?: boolean,
  ): HeatJsApi;
  removeDate(
    elementId: string,
    date: Date,
    trendType?: string | null,
    triggerUpdate?: boolean,
  ): HeatJsApi;
  reset(elementId: string, triggerUpdate?: boolean): HeatJsApi;
  refreshAll(): HeatJsApi;
}

declare global {
  interface Window {
    $heat?: HeatJsApi;
  }
}

const ELEMENT_ID = 'ffm-heatmap-demo';
const BINDING_OPTIONS = JSON.stringify({ views: { map: { showDayNames: true } } });

/** 为最近若干天生成随机访问数据。 */
function addRandomDates(api: HeatJsApi, days: number, trigger = true): void {
  const today = new Date();

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const count = Math.floor(Math.random() * 5);

    for (let index = 0; index < count; index += 1) {
      api.addDate(ELEMENT_ID, date, null, false);
    }
  }

  if (trigger) {
    api.refreshAll();
  }
}

export function HeatmapPage() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在初始化热力图…');

  useEffect(() => {
    let cancelled = false;

    // 等待元素挂载完成后再写入数据，确保 Heat.js 已自动识别 data-heat-js 容器。
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const api = window.$heat;
      if (!api) {
        setStatus('Heat.js 初始化失败，请刷新页面重试');
        return;
      }

      addRandomDates(api, 120);
      setReady(true);
      setStatus('已生成近 120 天的模拟访问数据');
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  function handleAdd(): void {
    const api = window.$heat;
    if (!api) return;

    addRandomDates(api, 7);
    setStatus('已随机补充最近 7 天的数据');
  }

  function handleReset(): void {
    const api = window.$heat;
    if (!api) return;

    api.reset(ELEMENT_ID, false);
    addRandomDates(api, 120);
    setStatus('已重置并重新生成近 120 天的数据');
  }

  return (
    <div className="page">
      <PageHeader
        title="数据热力图"
        description="基于 Heat.js 的轻量热力图，把日期数据转换为直观的热力层，支持按年查看与悬停提示。"
      />

      <Card title="年度热力图层" description={status}>
        <div className="form-inline" style={{ marginBottom: 16 }}>
          <Button size="sm" disabled={!ready} onClick={handleAdd}>
            随机补数据
          </Button>
          <Button size="sm" variant="secondary" disabled={!ready} onClick={handleReset}>
            重置数据
          </Button>
        </div>

        <div
          id={ELEMENT_ID}
          data-heat-js={BINDING_OPTIONS}
          style={{ minHeight: 320, overflowX: 'auto' }}
        />
      </Card>
    </div>
  );
}
