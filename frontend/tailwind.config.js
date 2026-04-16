/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#1B4332",
        surface: "#1F5038",
        "surface-2": "#245D40",
        "surface-3": "#2A6A48",
        gold: "#C5A55A",
        "gold-dim": "#D4B86A",
        "gold-bright": "#A38A3E",
        accent: {
          green: "#4CAF7A",
          red: "#E74C3C",
          blue: "#5B9BD5",
        },
        cream: "#FAF8F5",
        "text-primary": "#FAF8F5",
        "text-dim": "#A8C4B0",
        border: "#2D6A4F",
        "border-bright": "#3A7A5A",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Playfair Display", "serif"],
        mono: ["DM Mono", "monospace"],
        gate: ["Space Grotesk", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
