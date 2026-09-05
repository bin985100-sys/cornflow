/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Все цвета берутся из CSS-переменных (src/styles/tokens.css),
        // поэтому тёмная тема включается простой сменой data-theme на <html>.
        shell: 'rgb(var(--cf-shell) / <alpha-value>)',
        canvas: 'rgb(var(--cf-canvas) / <alpha-value>)',
        surface: 'rgb(var(--cf-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--cf-surface-2) / <alpha-value>)',
        line: 'rgb(var(--cf-line) / <alpha-value>)',
        ink: 'rgb(var(--cf-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--cf-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--cf-ink-3) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--cf-brand) / <alpha-value>)',
          soft: 'rgb(var(--cf-brand-soft) / <alpha-value>)',
        },
      },
      borderRadius: {
        card: '20px',
        soft: '16px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 8px 24px -12px rgb(16 24 40 / 0.12)',
        lift: '0 2px 4px rgb(16 24 40 / 0.05), 0 18px 40px -16px rgb(16 24 40 / 0.22)',
        pop: '0 12px 48px -12px rgb(16 24 40 / 0.28)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'page-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-left': {
          '0%': { opacity: '0', transform: 'translateX(-14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-right': {
          '0%': { opacity: '0', transform: 'translateX(14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.94)' },
          '60%': { opacity: '1', transform: 'translateY(-2px) scale(1.008)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.55' },
        },
        'check-pop': {
          '0%': { transform: 'scale(.4)', opacity: '0' },
          '70%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up .38s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .25s ease both',
        'scale-in': 'scale-in .22s cubic-bezier(.22,1,.36,1) both',
        page: 'page-in .42s cubic-bezier(.22,1,.36,1) both',
        'slide-left': 'slide-left .34s cubic-bezier(.22,1,.36,1) both',
        'slide-right': 'slide-right .34s cubic-bezier(.22,1,.36,1) both',
        pop: 'pop .34s cubic-bezier(.34,1.4,.5,1) both',
        'toast-in': 'toast-in .28s cubic-bezier(.34,1.4,.5,1) both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'check-pop': 'check-pop .28s cubic-bezier(.34,1.5,.5,1) both',
      },
    },
  },
  plugins: [],
}
