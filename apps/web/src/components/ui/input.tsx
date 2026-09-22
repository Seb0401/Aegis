import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
