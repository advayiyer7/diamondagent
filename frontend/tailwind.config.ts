import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        onyx: {
          950: "#08080a",
          900: "#0d0d10",
          800: "#16161b",
          700: "#1d1d23",
          600: "#26262d",
          500: "#3a3a44",
          400: "#5b5b67",
          300: "#8a8a96",
        },
        champagne: {
          50: "#fbf6ec",
          100: "#f4ead2",
          200: "#e8d4a5",
          300: "#dcbe78",
          400: "#d0a84b",
          500: "#b8903a",
          600: "#94722d",
          700: "#6f5522",
        },
        ivory: "#f6f1e6",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(220,190,120,0.25), 0 8px 40px -12px rgba(220,190,120,0.35)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 40px -16px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, #f4ead2 0%, #dcbe78 35%, #b8903a 100%)",
        "panel-grain":
          "radial-gradient(1200px 600px at 20% -10%, rgba(220,190,120,0.08), transparent 60%), radial-gradient(900px 500px at 100% 110%, rgba(220,190,120,0.06), transparent 60%)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 80%, 100%": { opacity: "0.2" },
          "40%": { opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 2.2s linear infinite",
        "fade-up": "fade-up 0.3s ease-out both",
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
