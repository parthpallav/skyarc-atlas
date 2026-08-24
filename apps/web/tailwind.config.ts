/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        primary: "var(--primary)",
        muted: "var(--muted)",
        sidebar: "var(--sidebar)",
        "skyarc-purple": "var(--skyarc-purple)",
        "skyarc-purple-dark": "var(--skyarc-purple-dark)",
        "skyarc-purple-light": "var(--skyarc-purple-light)",
        "skyarc-surface": "var(--skyarc-surface)",
        "skyarc-on-dark": "var(--skyarc-on-dark)",
        "skyarc-on-dark-muted": "var(--skyarc-on-dark-muted)",
        "skyarc-success": "var(--skyarc-success)",
        "skyarc-warning": "var(--skyarc-warning)",
        "skyarc-danger": "var(--skyarc-danger)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(168 85 247 / 0.08), 0 1px 2px -1px rgb(168 85 247 / 0.06)",
      },
    },
  },
  plugins: [],
};
