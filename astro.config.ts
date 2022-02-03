import type { AstroUserConfig } from "astro"

const config: AstroUserConfig = {
  public: "./static",
  buildOptions: {
    site: "https://princesseuh.netlify.app/",
  },
  renderers: [],
  vite: {
    optimizeDeps: {
      exclude: ["astro-eleventy-img"],
    },
    ssr: {
      external: ["svgo", "@11ty/eleventy-img"],
    },
    plugins: [],
  },
}

export default config
