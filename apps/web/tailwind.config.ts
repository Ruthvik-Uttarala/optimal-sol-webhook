/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        primary: "var(--text-primary)",
        accent: "var(--accent-ginger-500)"
      },
      borderRadius: {
        card: "var(--radius-card)",
        button: "var(--radius-button)"
      }
    }
  },
  plugins: []
};
