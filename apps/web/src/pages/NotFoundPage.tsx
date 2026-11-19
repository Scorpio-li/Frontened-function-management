import { Link } from 'react-router-dom';

import { EmptyState, PageHeader } from '@repo/ui';

export function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader title="页面不存在" description="当前地址没有匹配的功能模块路由。" />
      <EmptyState
        title="404"
        description="可以返回功能管理页重新选择模块。"
        action={
          <Link className="ffm-button ffm-button--primary ffm-button--md" to="/">
            返回功能管理
          </Link>
        }
      />
    </div>
  );
}
