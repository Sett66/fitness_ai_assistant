/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{tsx,ts}', '../../packages/ui/src/**/*.{tsx,ts}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#D0FD3E',
        background: '#000000',
        surface: '#121212',
        card: '#1C1C1E',
        accent: '#D0FD3E',
        'accent-muted': '#A8D632',
        'accent-foreground': '#0A0A0A',
        foreground: '#FFFFFF',
        muted: '#A1A1A1',
        border: '#2C2C2E',
        destructive: '#EF4444',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
    },
  },
};
