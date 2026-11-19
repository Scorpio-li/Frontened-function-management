import type { ReactNode } from 'react';

import { cn } from '@repo/utils';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, description, action, className, children }: CardProps) {
  const hasHeader = title !== undefined || description !== undefined || action !== undefined;

  return (
    <section className={cn('ffm-card', className)}>
      {hasHeader ? (
        <header className="ffm-card__header">
          <div className="ffm-card__heading">
            {title !== undefined ? <h2 className="ffm-card__title">{title}</h2> : null}
            {description !== undefined ? (
              <p className="ffm-card__description">{description}</p>
            ) : null}
          </div>
          {action !== undefined ? <div className="ffm-card__action">{action}</div> : null}
        </header>
      ) : null}
      <div className="ffm-card__body">{children}</div>
    </section>
  );
}
