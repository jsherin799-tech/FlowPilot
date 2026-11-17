import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-indigo-500/15 text-indigo-300',
  secondary: 'border-transparent bg-slate-800 text-slate-300',
  destructive: 'border-transparent bg-rose-500/10 text-rose-400',
  outline: 'border-slate-700 text-slate-400',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors', variants[variant], className)}
      {...props}
    />
  );
}
