import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ffm-empty-state">
      <p className="ffm-empty-state__title">{title}</p>
      {description !== undefined ? (
        <p className="ffm-empty-state__description">{description}</p>
      ) : null}
      {action !== undefined ? <div className="ffm-empty-state__action">{action}</div> : null}
    </div>
  );
}
