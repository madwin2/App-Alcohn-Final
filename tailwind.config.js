/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        /** Velo atmosférico mockups (capa superpuesta, sin mask-clip). */
        "mockup-sheet-veil-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "mockup-sheet-veil-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        /** Contracción vertical scaleY + translateY (scaleX=1). Sync carril. */
        "mockup-sheet-card-exit-up": {
          from: { transform: "scale(1, 1) translateY(0)" },
          to: { transform: "scale(1, 0.9) translateY(-10px)" },
        },
        "mockup-sheet-card-exit-down": {
          from: { transform: "scale(1, 1) translateY(0)" },
          to: { transform: "scale(1, 0.9) translateY(10px)" },
        },
        "mockup-sheet-card-enter-below": {
          from: { transform: "scale(1, 0.9) translateY(14px)" },
          to: { transform: "scale(1, 1) translateY(0)" },
        },
        "mockup-sheet-card-enter-above": {
          from: { transform: "scale(1, 0.9) translateY(-14px)" },
          to: { transform: "scale(1, 1) translateY(0)" },
        },
        /** Historial: misma lógica (solo eje Y) + cascada por fila. */
        "mockup-history-card-exit-up": {
          "0%": { transform: "scale(1, 1) translateY(0)" },
          "26%": { transform: "scale(1, 0.9) translateY(0)" },
          "52%": { transform: "scale(1, 0.86) translateY(-8px)" },
          "100%": { transform: "scale(1, 0.82) translateY(-14px)" },
        },
        "mockup-history-card-exit-down": {
          "0%": { transform: "scale(1, 1) translateY(0)" },
          "26%": { transform: "scale(1, 0.9) translateY(0)" },
          "52%": { transform: "scale(1, 0.86) translateY(8px)" },
          "100%": { transform: "scale(1, 0.82) translateY(14px)" },
        },
        "mockup-history-card-enter-below": {
          "0%": { transform: "scale(1, 0.82) translateY(18px)" },
          "32%": { transform: "scale(1, 0.88) translateY(6px)" },
          "62%": { transform: "scale(1, 0.94) translateY(0)" },
          "100%": { transform: "scale(1, 1) translateY(0)" },
        },
        "mockup-history-card-enter-above": {
          "0%": { transform: "scale(1, 0.82) translateY(-18px)" },
          "32%": { transform: "scale(1, 0.88) translateY(-6px)" },
          "62%": { transform: "scale(1, 0.94) translateY(0)" },
          "100%": { transform: "scale(1, 1) translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "mockup-sheet-veil-in": "mockup-sheet-veil-in 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-sheet-veil-out": "mockup-sheet-veil-out 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-sheet-card-exit-up": "mockup-sheet-card-exit-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-sheet-card-exit-down": "mockup-sheet-card-exit-down 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-sheet-card-enter-below": "mockup-sheet-card-enter-below 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-sheet-card-enter-above": "mockup-sheet-card-enter-above 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-history-card-exit-up": "mockup-history-card-exit-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-history-card-exit-down": "mockup-history-card-exit-down 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-history-card-enter-below": "mockup-history-card-enter-below 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "mockup-history-card-enter-above": "mockup-history-card-enter-above 0.7s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
