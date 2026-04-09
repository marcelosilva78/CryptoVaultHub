import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0c0c10",
        "bg-secondary": "#12121a",
        "bg-card": "#161620",
        accent: "#8b5cf6",
        "chart-1": "#3b82f6",
        "chart-2": "#22c55e",
        "chart-3": "#f59e0b",
        "chart-4": "#ef4444",
        "chart-5": "#8b5cf6",
      },
    },
  },
  plugins: [],
};
export default config;
