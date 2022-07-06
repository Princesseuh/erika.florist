const plugin = require("tailwindcss/plugin")

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      gridTemplateColumns: {
        main: "minmax(235px,10%) auto",
      },
    },
  },
  plugins: [
    plugin(function ({ addBase }) {
      addBase({
        "html, body, #app": {
          height: "100%",
        },
      })
    }),
  ],
}
