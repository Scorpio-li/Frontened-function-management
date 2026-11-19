import type { ReactNode } from 'react';

import { cn } from '@repo/utils';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return <span className={cn('ffm-badge', `ffm-badge--${tone}`, className)}>{children}</span>;
}
