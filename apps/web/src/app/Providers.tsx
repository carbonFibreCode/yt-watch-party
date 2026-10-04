import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/lib/theme';

/** Sonner's default gap (24px desktop, 16px mobile) plus the device's safe area. */
const TOAST_OFFSET = { top: 'calc(env(safe-area-inset-top) + 16px)' };

/** App-wide providers: theme (dark by default), REST cache, tooltips, toasts. */
export function Providers({ children }: { readonly children: ReactNode }): ReactElement {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          {children}
          {/* Below the notch in any orientation, including over the fullscreen player. */}
          <Toaster position="top-center" offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
