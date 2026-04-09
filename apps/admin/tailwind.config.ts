import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces
        'surface-page': 'var(--surface-page)',
        'surface-sidebar': 'var(--surface-sidebar)',
        'surface-card': 'var(--surface-card)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-hover': 'var(--surface-hover)',
        'surface-input': 'var(--surface-input)',
        // Text
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Accent (Vault Gold)
        'accent-primary': 'var(--accent-primary)',
        'accent-hover': 'var(--accent-hover)',
        'accent-subtle': 'var(--accent-subtle)',
        'accent-glow': 'var(--accent-glow)',
        'accent-text': 'var(--accent-text)',
        // Status
        'status-success': 'var(--status-success)',
        'status-success-subtle': 'var(--status-success-subtle)',
        'status-error': 'var(--status-error)',
        'status-error-subtle': 'var(--status-error-subtle)',
        'status-warning': 'var(--status-warning)',
        'status-warning-subtle': 'var(--status-warning-subtle)',
        // Chart
        'chart-primary': 'var(--chart-primary)',
        'chart-secondary': 'var(--chart-secondary)',
        'chart-tertiary': 'var(--chart-tertiary)',
        'chart-faded': 'var(--chart-faded)',
        'chart-up': 'var(--chart-up)',
        'chart-down': 'var(--chart-down)',
        // Borders
        'border-default': 'var(--border-default)',
        'border-subtle': 'var(--border-subtle)',
        'border-focus': 'var(--border-focus)',
      },
      borderRadius: {
        'card': '8px',
        'button': '8px',
        'input': '6px',
        'badge': '6px',
        'modal': '12px',
        'pill': '9999px',
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'hover': 'var(--shadow-hover)',
        'float': 'var(--shadow-float)',
        'glow': 'var(--shadow-glow)',
      },
      spacing: {
        'sidebar-w': '240px',
        'header-h': '56px',
        'content-p': '24px',
        'card-p': '20px',
        'section-gap': '24px',
        'stat-grid-gap': '16px',
      },
      fontFamily: {
        'display': ['Outfit', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display': ['32px', { lineHeight: '1.1', fontWeight: '800' }],
        'stat': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'heading': ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        'subheading': ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        'micro': ['10px', { lineHeight: '1.3', fontWeight: '600' }],
        'code': ['12px', { lineHeight: '1.6', fontWeight: '500' }],
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '400ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'heartbeat': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease forwards',
        'pulse-gold': 'pulse-gold 5s ease-in-out infinite',
        'heartbeat': 'heartbeat 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
