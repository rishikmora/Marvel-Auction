import type { Config } from 'tailwindcss';

/**
 * Warm, high-contrast dark theme.
 *
 * The palette is deliberately warm — a near-black with brown in it, cream text rather
 * than pure white, and a hot pink accent. It reads as playful and party-ish rather than
 * clinical, which suits a game you play with friends.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* surfaces */
        ink: '#0c0b0a',
        panel: '#201d1a',
        'panel-deep': '#161412',
        'panel-hi': '#2a2622',

        /* text */
        cream: '#f1ece2',
        subtle: '#a8a196',
        muted: '#8c8679',

        /* accents */
        accent: {
          DEFAULT: '#ff4d8d',
          soft: '#ff87b1',
          deep: '#e03570',
        },
        gold: { DEFAULT: '#f2c14e', soft: '#f8d98a', deep: '#c99a2e' },
        sky: '#5bc8e8',
        violet: '#a98bff',
        mint: '#5fd39b',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'Haettenschweiler', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        round: ['var(--font-round)', 'var(--font-sans)', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '1.05rem',
        pill: '999px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,77,141,.3), 0 0 30px -8px rgba(255,77,141,.5)',
        'glow-gold': '0 0 0 1px rgba(242,193,78,.35), 0 0 30px -8px rgba(242,193,78,.45)',
        'glow-sky': '0 0 0 1px rgba(91,200,232,.3), 0 0 28px -8px rgba(91,200,232,.45)',
        panel: '0 24px 60px -30px rgba(0,0,0,.9)',
        lift: '0 12px 32px -16px rgba(0,0,0,.8)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        /* Marquee halves are duplicated, so -50% loops seamlessly. */
        'marquee-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-right': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        bob: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.4s cubic-bezier(.2,.8,.3,1) infinite',
        'slide-up': 'slide-up .35s ease-out both',
        'marquee-left': 'marquee-left 62s linear infinite',
        'marquee-right': 'marquee-right 74s linear infinite',
        bob: 'bob 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
