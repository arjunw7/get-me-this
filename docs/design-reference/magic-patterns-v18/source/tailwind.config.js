export default {
  content: [
    './index.tsx',
    './App.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FBF6EE',
        cream: '#F4ECDF',
        line: '#E6DCCD',
        ink: {
          DEFAULT: '#17140F',
          soft: '#4F483F',
          mute: '#6B6358',
        },
        coral: {
          DEFAULT: '#FF5A36',
          deep: '#B8321A',
          soft: '#FFE4DB',
        },
        marigold: {
          DEFAULT: '#FFB320',
          deep: '#7A5000',
          soft: '#FFF0CC',
        },
        electric: {
          DEFAULT: '#2E4BFF',
          deep: '#1C2FB5',
          soft: '#E4E8FF',
        },
        lime: {
          DEFAULT: '#C6F062',
          deep: '#3F5710',
          soft: '#EEFAD2',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        chunk: '4px 4px 0 0 #17140F',
        'chunk-sm': '2px 2px 0 0 #17140F',
        'chunk-lg': '6px 6px 0 0 #17140F',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
