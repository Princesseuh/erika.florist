import type { AstroUserConfig } from "astro"

const config: AstroUserConfig = {
  publicDir: "./static",
  site: "https://princesseuh.netlify.app/",
  markdown: {
    syntaxHighlight: "shiki",
    shikiConfig: {
      theme: "material-darker",
      langs: [],
      wrap: false,
    },
  },
  integrations: [],
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
