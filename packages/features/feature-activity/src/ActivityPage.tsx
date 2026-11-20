import { useEventBus } from '@repo/core';
import { Button, Card, EmptyState, PageHeader } from '@repo/ui';
import { formatDateTime } from '@repo/utils';

import { useActivityRecords } from './activity-store';

export function ActivityPage() {
  const eventBus = useEventBus();
  const records = useActivityRecords();

  return (
    <div className="page">
      <PageHeader
        title="活动流"
        description="事件通过 @repo/core 的 EventBus 广播；记录保存在当前会话内存中，切换页面不会丢失。"
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={records.length === 0}
            onClick={() => eventBus.emit('activity:clear', undefined)}
          >
            清空记录
          </Button>
        }
      />

      <Card
        title={`最新 ${records.length} 条记录`}
        description="最多保留 20 条，来源为各功能模块广播的事件。"
      >
        {records.length === 0 ? (
          <EmptyState
            title="暂无活动"
            description="前往「功能概览」记录一条活动，这里会实时出现。"
          />
        ) : (
          <ul className="activity-list">
            {records.map((record) => (
              <li key={record.id} className="activity-item">
                <div>
                  <p className="activity-item__title">{record.title}</p>
                  <p className="activity-item__meta">来源：{record.featureId}</p>
                </div>
                <span className="activity-item__time">{formatDateTime(record.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
