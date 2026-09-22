import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        /* Severidad del Guardian: el color acompaña al texto, nunca lo sustituye. */
        low: 'border-transparent bg-risk-low/15 text-risk-low',
        medium: 'border-transparent bg-risk-medium/20 text-risk-medium',
        high: 'border-transparent bg-risk-high/20 text-risk-high',
        critical: 'border-transparent bg-risk-critical/20 text-risk-critical',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
