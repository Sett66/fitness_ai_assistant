import { createContext, useContext } from 'react';

import {
  darkColors,
  getNavigationTheme,
  getThemeColors,
  type ThemeColors,
  type ThemeMode,
} from '../theme';

export type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  navigationTheme: ReturnType<typeof getNavigationTheme>;
};

export const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkColors,
  isDark: true,
  navigationTheme: getNavigationTheme('dark'),
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function createThemeContextValue(mode: ThemeMode): ThemeContextValue {
  const colors = getThemeColors(mode);
  return {
    mode,
    colors,
    isDark: mode === 'dark',
    navigationTheme: getNavigationTheme(mode),
  };
}
