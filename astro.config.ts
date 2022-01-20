import type { AstroUserConfig } from "astro"

const config: AstroUserConfig = {
  public: "./static",
  buildOptions: {
    site: "https://princesseuh.netlify.app/",
  },
  renderers: [],
  vite: {
    ssr: {
      external: ["svgo"],
    },
    plugins: [],
  },
}

export default config
