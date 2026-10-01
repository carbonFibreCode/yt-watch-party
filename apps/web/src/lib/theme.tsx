import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ThemeContext } from './themeContext';
import type { Theme } from './themeContext';

const STORAGE_KEY = 'watchparty-theme';

const readStoredTheme = (): Theme => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
};

/**
 * Dark-by-default theme with a persisted light option. `public/theme-init.js` applies the stored
 * choice before first paint; this provider keeps it in sync afterwards.
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted when storage is unavailable; the choice still applies to this page.
    }
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
