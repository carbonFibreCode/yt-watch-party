import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/lib/theme';

/** App-wide providers: theme (dark by default), REST cache, tooltips, toasts. */
export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="top-center" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
