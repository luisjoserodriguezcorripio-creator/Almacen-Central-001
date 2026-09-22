/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dc: {
          blue: '#1e40af',
          'blue-dark': '#1e3a8a',
          green: '#16a34a',
          'green-dark': '#15803d',
          gray: '#64748b',
          'gray-dark': '#334155',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 8px 32px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};
