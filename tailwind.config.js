/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#F7F3EE",
          deep: "#EDF6FF",
        },
        lilac: {
          50: "#f2f9ff",
          100: "#e2f0ff",
          200: "#cfe5ff",
          300: "#b8d9ff",
          400: "#7db7f2",
          500: "#4b9ae6",
          600: "#357dbe",
          700: "#255f9a",
        },
        ink: "#102435",
      },
      fontFamily: {
        display: ["Calibri", "Segoe UI", "sans-serif"],
        body: ["Calibri", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        soft: "0 12px 26px -18px rgba(47, 109, 176, 0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
}
