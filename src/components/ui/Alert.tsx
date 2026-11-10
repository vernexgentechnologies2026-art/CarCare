import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { TONE_CLASSES, type Tone } from './Badge';

export function Alert({ tone = 'brand', title, children, icon, className }: { tone?: Tone; title?: string; children?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset', TONE_CLASSES[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
