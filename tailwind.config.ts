import type { Config } from 'tailwindcss';

// Brand palette from the Elizabeth Medical Centre guidelines.
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        clay: '#a35038',
        offwhite: '#e3ceb1',
        teal: { DEFAULT: '#466c67', deep: '#36534f', soft: '#e6eeec' },
        sage: '#9aa585',
        pulse: '#662b1d',
        cream: '#f8eadb',
        paper: '#fdf9f4',
        ink: { DEFAULT: '#231f1f', soft: '#5b5450' },
        line: '#e8ddd0',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'Arial Rounded MT Bold', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        label: ['var(--font-label)', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 40px -24px rgba(35,31,31,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
