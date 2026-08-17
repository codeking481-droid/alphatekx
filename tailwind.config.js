/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Canvas - off-black like Linear
        canvas: "#05050a",
        canvasDeep: "#000000",
        
        // Surface ladder - elevation through color, not shadow
        surface1: "#0a0a12",
        surface2: "#0f0f1a",
        surface3: "#141420",
        surface4: "#191926",
        
        // Text
        bone: "#ffffff",
        grey: "#a1a1aa",
        greyMuted: "#71717a",
        
        // Single accent - Signal Lime, used sparingly
        lime: "#D7FF00",
        limeDim: "#B8D900",
        
        // Additional colors
        purple: "#a855f7",
        purpleLight: "#c084fc",
        purpleDark: "#7e22ce",
        yellow: "#facc15",
        yellowLight: "#fde047",
        yellowDark: "#ca8a04",
        
        // Hairline borders
        border: "#1f1f2e",
        borderSoft: "#34343a",
      },
      boxShadow: {
        "lime": "0 0 20px rgba(215, 255, 0, 0.15)",
        "lime-strong": "0 0 30px rgba(215, 255, 0, 0.25)",
        subtle: "0 1px 2px rgba(0, 0, 0, 0.3)",
        purple: "0 0 20px rgba(168, 85, 247, 0.3)",
        "purple-strong": "0 0 30px rgba(168, 85, 247, 0.5)",
        yellow: "0 0 20px rgba(250, 204, 21, 0.3)",
        "yellow-strong": "0 0 30px rgba(250, 204, 21, 0.5)",
      },
      letterSpacing: {
        "tighter": "-0.022em",
        "tight": "-0.015em",
      },
      fontSize: {
        "display": ["88px", { lineHeight: "0.85", letterSpacing: "-0.022em", fontWeight: "600" }],
        "display-lg": ["120px", { lineHeight: "0.85", letterSpacing: "-0.022em", fontWeight: "600" }],
        "body": ["17px", { lineHeight: "1.6", letterSpacing: "0" }],
      },
      spacing: {
        "128": "32rem",
        "160": "40rem",
        "192": "48rem",
      },
      borderRadius: {
        "xl": "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      transitionTimingFunction: {
        "expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        "400": "400ms",
        "600": "600ms",
      },
    },
  },
  plugins: [],
}
