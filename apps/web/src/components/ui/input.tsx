import * as React from 'react';
import { cn } from '@/lib/utils';

/** NeoPOP input: sharp, 2px border, solid fill; focus turns the border to the ring colour. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 border-2 border-input bg-card px-3 py-1 text-base font-medium text-foreground transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:font-normal placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:outline-none',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
