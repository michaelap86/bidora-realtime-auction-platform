const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: { bg: c("bg"), surface: c("surface"), soft: c("soft"), ink: c("ink"), muted: c("muted"), line: c("line"), brand: c("brand"), brand2: c("brand2"), accent: c("accent"), ok: c("ok"), bad: c("bad") },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], display: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgb(var(--shadow) / .06), 0 8px 24px -12px rgb(var(--shadow) / .18)", lift: "0 18px 40px -16px rgb(var(--shadow) / .35)", glow: "0 0 0 1px rgb(var(--brand) / .25), 0 12px 40px -10px rgb(var(--brand) / .55)" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgb(var(--ok) / .55)" }, "100%": { boxShadow: "0 0 0 10px rgb(var(--ok) / 0)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
      },
      animation: { shimmer: "shimmer 1.4s infinite", floaty: "floaty 6s ease-in-out infinite", ring: "pulseRing 1.6s infinite", marquee: "marquee 40s linear infinite" },
    },
  },
  plugins: [],
};
