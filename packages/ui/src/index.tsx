import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { darkColors } from './theme';

type ClassNameProps = { className?: string; safeTop?: boolean };

export function Screen({ className, style, safeTop = true, ...props }: ViewProps & ClassNameProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-background px-4 ${className ?? ''}`}
      style={[safeTop ? { paddingTop: insets.top + 8 } : undefined, style]}
      {...props}
    />
  );
}

type CardProps = ViewProps &
  ClassNameProps & {
    variant?: 'default' | 'accent';
  };

export function Card({ className, variant = 'default', ...props }: CardProps) {
  const variantClass = variant === 'accent' ? 'bg-accent border-accent' : 'bg-card border-border';
  return (
    <View className={`rounded-2xl border p-4 ${variantClass} ${className ?? ''}`} {...props} />
  );
}

export function Title({ className, ...props }: TextProps & ClassNameProps) {
  return <Text className={`text-xl font-bold text-foreground ${className ?? ''}`} {...props} />;
}

export function Subtitle({ className, ...props }: TextProps & ClassNameProps) {
  return <Text className={`text-sm text-muted ${className ?? ''}`} {...props} />;
}

export function Label({ className, ...props }: TextProps & ClassNameProps) {
  return <Text className={`mb-1 text-sm font-medium text-muted ${className ?? ''}`} {...props} />;
}

export function Input({ className, ...props }: TextInputProps & ClassNameProps) {
  return (
    <TextInput
      className={`rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground ${className ?? ''}`}
      placeholderTextColor="#A1A1A1"
      {...props}
    />
  );
}

type ButtonProps = PressableProps &
  ClassNameProps & {
    title: string;
    loading?: boolean;
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  };

const buttonVariantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent',
  secondary: 'bg-card border border-border',
  ghost: 'bg-transparent',
  destructive: 'bg-destructive',
};

const buttonTextVariantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-accent-foreground',
  secondary: 'text-foreground',
  ghost: 'text-accent',
  destructive: 'text-white',
};

export function Button({
  title,
  loading,
  className,
  disabled,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={`rounded-xl px-4 py-3 items-center ${buttonVariantClasses[variant]} ${disabled || loading ? 'opacity-50' : ''} ${className ?? ''}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? darkColors.accentForeground : darkColors.accent}
        />
      ) : (
        <Text className={`text-base font-semibold ${buttonTextVariantClasses[variant]}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function LoadingScreen(): ReactNode {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={darkColors.accent} />
    </View>
  );
}

export function ErrorText({ message }: { message: string }) {
  return <Text className="text-sm text-destructive">{message}</Text>;
}

export function MacroRow({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-muted">{label}</Text>
      <Text className="font-medium text-foreground">
        {Math.round(value)}
        {unit ?? ''}
      </Text>
    </View>
  );
}

export { ThemeProvider } from './ThemeProvider';
export { useTheme } from './hooks/useTheme';
export {
  darkColors,
  lightColors,
  getThemeColors,
  navigationThemeDark,
  stackHeaderOptions,
  tabBarOptions,
} from './theme';
export type { ThemeColors, ThemeMode } from './theme';
export { AppHeader } from './components/AppHeader';
export { IconButton } from './components/IconButton';
export { ProgressRing } from './components/ProgressRing';
export { SectionHeader } from './components/SectionHeader';
export { StatCard } from './components/StatCard';
export * from './icons';
