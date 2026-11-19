import { useState } from 'react';
import type { FormEvent } from 'react';

import { useEventBus, useFeatures } from '@repo/core';
import { Button, Card, PageHeader } from '@repo/ui';
import { createId, formatDateTime } from '@repo/utils';

interface Submission {
  id: string;
  title: string;
  at: string;
}

export function DashboardPage() {
  const entries = useFeatures();
  const eventBus = useEventBus();
  const [title, setTitle] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const enabledFeatures = entries.filter((entry) => entry.enabled);
  const routeCount = enabledFeatures.reduce(
    (total, entry) => total + entry.feature.routes.length,
    0,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    eventBus.emit('activity:record', { title: nextTitle, featureId: 'dashboard' });
    setSubmissions((previous) =>
      [
        { id: createId('submission'), title: nextTitle, at: new Date().toISOString() },
        ...previous,
      ].slice(0, 5),
    );
    setTitle('');
  }

  return (
    <div className="page">
      <PageHeader
        title="功能概览"
        description="当前页面来自 @repo/feature-dashboard 功能包，宿主负责注册路由、导航与启停控制。"
      />

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-card__label">已注册功能</p>
          <p className="stat-card__value">{entries.length}</p>
          <p className="stat-card__hint">来自 packages/feature-*</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">已启用功能</p>
          <p className="stat-card__value">{enabledFeatures.length}</p>
          <p className="stat-card__hint">可在功能管理中随时启停</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">启用路由</p>
          <p className="stat-card__value">{routeCount}</p>
          <p className="stat-card__hint">由宿主根据功能契约自动生成</p>
        </div>
      </div>

      <div className="card-stack">
        <Card
          title="记录一条活动"
          description="提交后会通过事件总线广播到「活动流」功能，用于演示跨模块通信。"
        >
          <form className="form-inline" onSubmit={handleSubmit}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：完成插件化宿主接入"
              aria-label="活动标题"
            />
            <Button type="submit" disabled={title.trim().length === 0}>
              记录活动
            </Button>
          </form>

          {submissions.length > 0 ? (
            <ul className="recent-list">
              {submissions.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <span className="recent-list__time">{formatDateTime(item.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">还没有本页提交记录。</p>
          )}
        </Card>

        <Card title="插件契约" description="每个功能模块只需要声明元信息、路由与可选的初始化逻辑。">
          <ul className="contract-list">
            <li>
              <code>id / name / version</code> 描述模块身份
            </li>
            <li>
              <code>routes</code> 声明页面与导航项
            </li>
            <li>
              <code>setup</code> 在启动时注册事件监听
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
