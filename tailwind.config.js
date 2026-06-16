/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#f0f9f7',
          100: '#d0eeea',
          200: '#a3ddd6',
          300: '#6ec5bc',
          400: '#4aaba2',
          500: '#6aada5',
          600: '#4a8f88',
          700: '#3d7570',
          800: '#355f5b',
          900: '#2e4f4c',
        },
        charcoal: {
          50: '#f5f5f4',
          100: '#e6e5e3',
          200: '#cecdca',
          300: '#aaa8a3',
          400: '#84817b',
          500: '#696661',
          600: '#575450',
          700: '#484643',
          800: '#3d3b38',
          900: '#2d2b28',
          950: '#1a1917',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
