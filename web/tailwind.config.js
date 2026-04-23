/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#080810",
          900: "#0E0E1A",
          800: "#15152A",
          700: "#1E1E38",
        },
        polka: {
          50: "#fff1f3",
          100: "#ffe0e5",
          200: "#ffc6cf",
          300: "#ff9bac",
          400: "#ff5f7a",
          500: "#e6007a",
          600: "#c30066",
          700: "#a30055",
          800: "#880049",
          900: "#740041",
        },
        role: {
          customer: "#e6007a",
          restaurant: "#F59E0B",
          rider: "#06B6D4",
        },
        accent: {
          blue: "#06B6D4",
          purple: "#a78bfa",
          green: "#10B981",
          orange: "#F59E0B",
          red: "#f87171",
          yellow: "#fbbf24",
        },
        text: {
          primary: "#EEE9F7",
          secondary: "#8B8699",
          tertiary: "#6A667A",
          muted: "#49465A",
        },
      },
      fontFamily: {
        display: ['"Syne"', "system-ui", "-apple-system", "sans-serif"],
        body: ['"DM Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out forwards",
        "slide-up": "slideUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
        "shimmer": "shimmer 1.8s ease-in-out infinite",
        "glow-pulse": "glowPulse 2.5s ease-in-out infinite",
        "scale-in": "scaleIn 0.2s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(230, 0, 122, 0.2)",
        "glow-lg": "0 0 48px -8px rgba(230, 0, 122, 0.3)",
        "glow-cyan": "0 0 24px -4px rgba(6, 182, 212, 0.2)",
        "glow-amber": "0 0 24px -4px rgba(245, 158, 11, 0.2)",
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
        "card-hover": "0 8px 24px rgba(0,0,0,0.5), 0 2px 4px -1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
    },
  },
  plugins: [],
};
