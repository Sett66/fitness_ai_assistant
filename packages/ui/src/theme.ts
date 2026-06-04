import type { Theme } from '@react-navigation/native';

export type ThemeMode = 'dark' | 'light';

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  accent: string;
  accentMuted: string;
  accentForeground: string;
  foreground: string;
  muted: string;
  border: string;
  destructive: string;
};

export const darkColors: ThemeColors = {
  background: '#000000',
  surface: '#121212',
  card: '#1C1C1E',
  accent: '#D0FD3E',
  accentMuted: '#A8D632',
  accentForeground: '#0A0A0A',
  foreground: '#FFFFFF',
  muted: '#A1A1A1',
  border: '#2C2C2E',
  destructive: '#EF4444',
};

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  card: '#FFFFFF',
  accent: '#84CC16',
  accentMuted: '#65A30D',
  accentForeground: '#0A0A0A',
  foreground: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  destructive: '#DC2626',
};

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}

export const navigationThemeDark: Theme = {
  dark: true,
  colors: {
    primary: darkColors.accent,
    background: darkColors.background,
    card: darkColors.card,
    text: darkColors.foreground,
    border: darkColors.border,
    notification: darkColors.accent,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};

export const navigationThemeLight: Theme = {
  dark: false,
  colors: {
    primary: lightColors.accent,
    background: lightColors.background,
    card: lightColors.card,
    text: lightColors.foreground,
    border: lightColors.border,
    notification: lightColors.accent,
  },
  fonts: navigationThemeDark.fonts,
};

export function getNavigationTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? navigationThemeDark : navigationThemeLight;
}

export const tabBarOptions = {
  activeTintColor: darkColors.accent,
  inactiveTintColor: darkColors.muted,
  backgroundColor: darkColors.background,
  borderTopColor: darkColors.border,
};

export const stackHeaderOptions = {
  headerStyle: { backgroundColor: darkColors.background },
  headerTintColor: darkColors.accent,
  headerTitleStyle: { color: darkColors.foreground },
  headerShadowVisible: false,
};
