import type { Config } from 'tailwindcss'

// UI-03 — every token from `Claude Design - Design Tokens.html` is mapped here.
// Additions for chart palette, responsive breakpoints, and empty/error patterns
// are noted inline.

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // ----- Responsive breakpoints (additions per Phase 9 spec) -----
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      // ----- Color tokens -----
      colors: {
        ink: {
          50: '#f4f4f3',
          100: '#e6e6e4',
          200: '#c9c9c5',
          300: '#a4a49f',
          400: '#6c6c67',
          500: '#46464a',
          600: '#353539',
          700: '#2c2e35',
          800: '#22242a',
          900: '#171920',
        },
        paper: {
          0: '#ffffff',
          50: '#fafaf8',
          100: '#f4f3ef',
          150: '#eeede7',
          200: '#eae8e2',
          300: '#d9d7cf',
          400: '#b5b3aa',
          500: '#87857d',
          600: '#5e5d57',
          700: '#3f3e3a',
          900: '#1a1a18',
        },
        sage: {
          50: '#eef1ec',
          100: '#d8ded1',
          300: '#9aaa95',
          500: '#6e8475',
          600: '#5e7e6e',
          700: '#4a6457',
        },
        success: { 50: '#ecf1ec', 500: '#5e7e6e', 600: '#4a6457', 700: '#374b41' },
        warn: { 50: '#f5efdf', 500: '#9c7a2a', 600: '#7a5e1d', 700: '#5d4714' },
        danger: { 50: '#f5e8e2', 500: '#9e4a2f', 600: '#7d3a24', 700: '#5c2b1b' },
        info: { 50: '#e8ecf1', 500: '#4a5f7a', 600: '#3a4a5f' },
        ai: { 50: '#ede9f0', 500: '#6a5a85', 600: '#564668', 700: '#3f324c' },

        // Semantic aliases
        canvas: '#fafaf8',
        'surface-low': '#f4f3ef',
        'surface-lowest': '#ffffff',
        'surface-high': '#eae8e2',
        text: '#2c2e35',
        'text-muted': '#5e5d57',
        'text-subtle': '#87857d',
        'text-invert': '#ffffff',
        accent: '#2c2e35',
        'accent-hover': '#22242a',

        // Chart palette (addition — Phase 9 spec)
        chart: {
          1: '#6e8475', // sage
          2: '#4a5f7a', // info
          3: '#9c7a2a', // warn
          4: '#9e4a2f', // danger
          5: '#6a5a85', // ai
          6: '#46464a', // ink
        },
      },

      // ----- Typography -----
      fontFamily: {
        sans: [
          'Geist',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['IBM Plex Mono', 'ui-monospace', 'Fira Code', 'monospace'],
        display: [
          'Instrument Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      fontSize: {
        '10': ['10px', '1.3'],
        '11': ['11px', '1.3'],
        '12': ['12px', '1.55'],
        '13': ['13px', '1.55'],
        '14': ['14px', '1.55'],
        '15': ['15px', '1.55'],
        '16': ['16px', '1.55'],
        '18': ['18px', '1.3'],
        '20': ['20px', '1.3'],
        '24': ['24px', '1.3'],
        '28': ['28px', '1.1'],
        '32': ['32px', '1.1'],
        '40': ['40px', '1.1'],
        '56': ['56px', '1.1'],
      },
      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semi: '600',
        bold: '700',
      },
      lineHeight: { tight: '1.1', snug: '1.3', base: '1.55' },

      // ----- Spacing -----
      spacing: {
        sp0: '0',
        sp1: '2px',
        sp2: '4px',
        sp3: '8px',
        sp4: '12px',
        sp5: '16px',
        sp6: '20px',
        sp7: '24px',
        sp8: '32px',
        sp9: '40px',
        sp10: '48px',
        sp11: '64px',
        sp12: '96px',
        topbar: '56px',
      },
      maxWidth: { doc: '1280px' },

      // ----- Radii -----
      borderRadius: {
        none: '0',
        '1': '2px',
        '2': '4px',
        '3': '6px',
        '4': '8px',
        pill: '999px',
      },

      // ----- Shadows -----
      boxShadow: {
        none: 'none',
        glow: '0 24px 48px rgba(44, 46, 53, 0.04)',
        overlay: '0 32px 64px rgba(44, 46, 53, 0.08)',
        focus: '0 0 0 3px rgba(44, 46, 53, 0.25)',
      },

      // ----- Motion -----
      transitionDuration: {
        '1': '80ms',
        '2': '140ms',
        '3': '220ms',
        '4': '320ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0.0, 0.2, 1)',
        emphasized: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },

      // ----- Empty / error state pattern utilities (additions) -----
      backgroundImage: {
        'empty-pattern':
          'repeating-linear-gradient(45deg, transparent 0 8px, rgba(23,22,18,0.04) 8px 9px)',
        'error-pattern':
          'repeating-linear-gradient(45deg, transparent 0 6px, rgba(158,74,47,0.08) 6px 7px)',
      },
    },
  },
  plugins: [],
}

export default config
