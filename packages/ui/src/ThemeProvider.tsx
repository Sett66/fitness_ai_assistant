import type { ReactNode } from 'react';

import { ThemeContext, createThemeContextValue } from './hooks/useTheme';
import type { ThemeMode } from './theme';

type ThemeProviderProps = {
  mode?: ThemeMode;
  children: ReactNode;
};

export function ThemeProvider({ mode = 'dark', children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={createThemeContextValue(mode)}>{children}</ThemeContext.Provider>
  );
}
