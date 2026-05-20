import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: "#fdfcf8",
          100: "#faf7ef",
          200: "#f3ede0",
          300: "#ebe2cc",
          DEFAULT: "#faf7ef",
        },
        bone: {
          100: "#f0ebe0",
          200: "#e3dccb",
          300: "#d2c8b0",
          400: "#b9ad8e",
        },
        gold: {
          300: "#e6cc7a",
          400: "#d4b352",
          500: "#b89028",
          600: "#9a7619",
          700: "#7a5d11",
        },
        silver: {
          200: "#e5e5e7",
          300: "#c7c7cb",
          400: "#a8a8ad",
          500: "#8a8a90",
        },
        ink: {
          400: "#8a7d6e",
          500: "#6b5f52",
          700: "#4a4138",
          800: "#2c2620",
          900: "#1a1611",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Playfair Display", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Warm, subtle — never harsh black.
        glow: "0 0 0 1px rgba(184,144,40,0.18), 0 8px 32px -12px rgba(184,144,40,0.28)",
        card: "0 2px 24px rgba(184,144,40,0.06)",
        elevated: "0 0 0 1px rgba(184,144,40,0.10), 0 24px 60px -28px rgba(74,65,56,0.18)",
        soft: "0 1px 0 rgba(184,144,40,0.10) inset",
      },
      backgroundImage: {
        "gold-gradient":
          "linear-gradient(135deg, #e6cc7a 0%, #d4b352 35%, #b89028 100%)",
        "gold-gradient-deep":
          "linear-gradient(135deg, #d4b352 0%, #b89028 50%, #9a7619 100%)",
        "silver-gradient":
          "linear-gradient(135deg, #e5e5e7 0%, #c7c7cb 50%, #a8a8ad 100%)",
        "ivory-grain":
          "radial-gradient(1400px 700px at 10% -5%, rgba(212,179,82,0.10), transparent 60%), radial-gradient(1100px 600px at 100% 105%, rgba(199,199,203,0.08), transparent 60%)",
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
        // Slow text shimmer for the wordmark / loading states.
        "wordmark-shimmer": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        // Gold underline that draws in under the active tab.
        "underline-grow": {
          "0%": { transform: "scaleX(0)", opacity: "0" },
          "100%": { transform: "scaleX(1)", opacity: "1" },
        },
      },
      animation: {
        shimmer: "shimmer 2.2s linear infinite",
        "shimmer-slow": "shimmer 3s linear infinite",
        "fade-up": "fade-up 0.4s ease-out both",
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
        "wordmark-shimmer": "wordmark-shimmer 8s linear infinite",
        "underline-grow": "underline-grow 0.45s ease-out forwards",
      },
      transitionDuration: {
        DEFAULT: "300ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
