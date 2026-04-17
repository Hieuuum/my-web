/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
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
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
