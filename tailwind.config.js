/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#334155",
            a: { color: "#0f172a", textDecoration: "underline" },
            "h1,h2,h3,h4": { color: "#0f172a" },
          },
        },
        invert: {
          css: {
            color: "#d4d4d8",
            a: { color: "#e4e4e7", textDecoration: "underline" },
            "h1,h2,h3,h4": { color: "#f4f4f5" },
            strong: { color: "#f4f4f5" },
            code: { color: "#f4f4f5" },
            blockquote: { color: "#d4d4d8" },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
