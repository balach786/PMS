/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // BK brand palette - extracted from the supplied poster
        navy: {
          50: '#F1F5FA',
          100: '#DDE6F1',
          200: '#BCCDE2',
          300: '#8FAAC9',
          400: '#5B82AF',
          500: '#3C5D94',
          600: '#2E4B7C',
          700: '#1D3B61',
          800: '#142A47',
          900: '#0B1A2B',
          950: '#06111C',
        },
        gold: {
          50: '#FBF7EE',
          100: '#F4EAD2',
          200: '#E7D3A3',
          300: '#D8BB79',
          400: '#C7A465',
          500: '#B69952',
          600: '#9C7F3E',
          700: '#7C6432',
          800: '#61522B',
          900: '#443A1F',
        },
        lime: {
          400: '#7CBF1C',
          500: '#639C14',
          600: '#4E7C10',
        },
        ink: {
          50: '#F7F9FC',
          100: '#EEF2F7',
          200: '#DDE4ED',
          300: '#C3CEDC',
          400: '#8E9DAF',
          500: '#6B7A8D',
          600: '#4C5A6B',
          700: '#374453',
          800: '#232F3D',
          900: '#141C26',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 32, 56, 0.04), 0 4px 16px rgba(16, 32, 56, 0.06)',
        pop: '0 8px 32px rgba(11, 26, 43, 0.16)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
