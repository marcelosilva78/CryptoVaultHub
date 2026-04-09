import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "cvh-bg-primary": "#07080a",
        "cvh-bg-secondary": "#0d0f12",
        "cvh-bg-tertiary": "#141720",
        "cvh-bg-elevated": "#1a1d28",
        "cvh-bg-hover": "#1f2233",
        "cvh-border": "#252838",
        "cvh-border-subtle": "#1a1d28",
        "cvh-text-primary": "#e4e6f0",
        "cvh-text-secondary": "#7c82a0",
        "cvh-text-muted": "#4a4f6a",
        "cvh-accent": "#3b82f6",
        "cvh-accent-dim": "#2563eb",
        "cvh-green": "#22c55e",
        "cvh-red": "#ef4444",
        "cvh-orange": "#f59e0b",
        "cvh-teal": "#14b8a6",
        "cvh-purple": "#8b5cf6",
      },
      fontFamily: {
        display: ["Outfit", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        cvh: "8px",
        "cvh-lg": "12px",
      },
    },
  },
  plugins: [],
};

export default config;
