/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dms: {
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#f59e0b',
          success: '#22c55e',
          danger: '#ef4444',
          dark: '#1e293b',
          light: '#f8fafc',
        },
      },
    },
  },
  plugins: [],
};
