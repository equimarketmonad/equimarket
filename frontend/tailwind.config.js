/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080807",
        surface: "#0f0f0d",
        "surface-2": "#161613",
        "surface-3": "#1d1d19",
        gold: "#c8a45a",
        "gold-dim": "#8a6e35",
        "gold-bright": "#e8c87a",
        accent: {
          green: "#5aab7a",
          red: "#c85a5a",
          blue: "#5a7fc8",
        },
        "text-primary": "#e5e2d8",
        "text-dim": "#9a9688",
        border: "#242420",
        "border-bright": "#3a3a32",
      },
      fontFamily: {
        sans: ["Syne", "sans-serif"],
        serif: ["Cormorant Garamond", "serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
