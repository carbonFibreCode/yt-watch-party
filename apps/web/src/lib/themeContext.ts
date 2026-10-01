import { createContext, useContext } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
};
