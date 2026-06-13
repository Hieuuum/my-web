/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        sfpro: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            fontSize: "1.0625rem",
            color: "#1e293b",
            a: { color: "#0f172a", textDecoration: "underline" },
            "h1,h2,h3,h4": { color: "#0f172a" },
          },
        },
        invert: {
          css: {
            color: "#e4e4e7",
            a: { color: "#f4f4f5", textDecoration: "underline" },
            "h1,h2,h3,h4": { color: "#f4f4f5" },
            strong: { color: "#f4f4f5" },
            code: { color: "#f4f4f5" },
            blockquote: { color: "#e4e4e7" },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
