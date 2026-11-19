import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="ffm-page-header">
      <div>
        <h1 className="ffm-page-header__title">{title}</h1>
        {description !== undefined ? (
          <p className="ffm-page-header__description">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? <div className="ffm-page-header__actions">{actions}</div> : null}
    </header>
  );
}
