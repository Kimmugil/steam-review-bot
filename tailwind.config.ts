import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        positive: {
          DEFAULT: "#059669",
          light: "#d1fae5",
          text: "#065f46",
        },
        negative: {
          DEFAULT: "#dc2626",
          light: "#fee2e2",
          text: "#7f1d1d",
        },
        mixed: {
          DEFAULT: "#d97706",
          light: "#fef3c7",
          text: "#78350f",
        },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
