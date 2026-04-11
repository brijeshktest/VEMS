/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./app/(public)/**/*.{js,jsx,ts,tsx}",
    "./app/(protected)/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      maxWidth: {
        layout: "1240px"
      },
      spacing: {
        nav: "64px"
      }
    }
  },
  plugins: []
};
