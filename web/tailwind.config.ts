import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0c10",
        surface: "#10141b",
        "surface-2": "#161b24",
        border: "#222a36",
        "border-bright": "#2f3a4a",
        muted: "#6b7686",
        fg: "#d7dde6",
        "fg-bright": "#f2f5f9",
        accent: "#3ddc97", // terminal green
        "accent-dim": "#1f6b4d",
        warn: "#f5a623",
        danger: "#ff5c5c",
        info: "#5ac8fa",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(61,220,151,0.25), 0 0 24px -8px rgba(61,220,151,0.35)",
      },
      keyframes: {
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        blink: "blink 1.1s step-end infinite",
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
