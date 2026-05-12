import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        display: ["'Instrument Serif'", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
        bg: {
          0: "#080810",
          1: "#0d0d1a",
          2: "#121224",
        },
        accent:  "#00e5a0",
        warn:    "#f59e0b",
        nexus:   "#f97316",
        shield:  "#0ea5e9",
        yield:   "#eab308",
        atlas:   "#a855f7",
        line:    "rgba(255,255,255,0.08)",
        "line-strong": "rgba(255,255,255,0.14)",
      },
      animation: {
        "ticker": "ticker 28s linear infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        ticker: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
