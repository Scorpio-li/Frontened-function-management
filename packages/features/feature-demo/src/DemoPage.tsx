import { useState } from 'react';

import { Button, Card, PageHeader } from '@repo/ui';

export function DemoPage() {
  const [count, setCount] = useState(0);

  return (
    <div className="page">
      <PageHeader title="示例功能" description="这是我新增的第一个功能包。" />
      <Card title="计数器" description="验证功能包可以被宿主正常挂载。">
        <p>当前值：{count}</p>
        <Button onClick={() => setCount((value) => value + 1)}>加一</Button>
      </Card>
    </div>
  );
}
