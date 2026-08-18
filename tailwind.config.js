import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: '#0A0A0A',
        lime: {
          DEFAULT: '#D6FF00',
          50: '#F5FFD6',
          100: '#EAFFB3',
          200: '#D6FF00',
          300: '#C2E600',
          400: '#AACC00',
          500: '#91B300',
        },
        gold: {
          DEFAULT: '#FFD700',
          50: '#FFF9E0',
          100: '#FFF0B3',
          200: '#FFE666',
          300: '#FFD700',
          400: '#E6C200',
          500: '#CCA800',
        },
        alphatekx: {
          DEFAULT: '#6366F1',
          indigo: '#6366F1',
          violet: '#8B5CF6',
          pink: '#EC4899',
          emerald: '#10B981',
          dark: '#0A0A0A',
          surface: '#0F0F0F',
          card: '#111111',
          muted: '#6B7280'
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      fontFamily: {
        syne: ['Syne', 'var(--font-heading)', 'var(--font-body)'],
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)']
      },
      boxShadow: {
        'lime-glow': '0 0 20px rgba(214,255,0,0.3), 0 0 60px rgba(214,255,0,0.1)',
        'lime-glow-lg': '0 0 30px rgba(214,255,0,0.4), 0 0 80px rgba(214,255,0,0.15)',
        'gold-glow': '0 0 20px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.1)',
      },
      boxShadow: {
        'premium': '0 4px 24px rgba(0,0,0,0.06)',
        'glow-indigo': '0 0 30px rgba(99,102,241,0.35)',
        'glow-violet': '0 0 30px rgba(139,92,246,0.35)',
        'glow-pink': '0 0 30px rgba(236,72,153,0.30)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'shimmer': {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' }
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(214,255,0,0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(214,255,0,0.5)' }
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.35s ease-out forwards',
        'fade-in': 'fade-in 0.25s ease-out forwards',
        'scale-in': 'scale-in 0.25s ease-out forwards',
        'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 4s ease-inout infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out forwards',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite'
      }
    }
  },
  plugins: [tailwindcssAnimate],
}
