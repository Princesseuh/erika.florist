import type { AstroUserConfig } from "astro"

const config: AstroUserConfig = {
  public: "./static",
  buildOptions: {
    site: "https://princesseuh.netlify.app/",
  },
  markdownOptions: {
    render: [
      "@astrojs/markdown-remark",
      {
        // Pick a syntax highlighter. Can be 'prism' (default), 'shiki' or false to disable any highlighting.
        syntaxHighlight: "shiki",
        // If you are using shiki, here you can define a global theme and
        // add custom languages.
        shikiConfig: {
          theme: "material-darker",
          langs: [],
          wrap: false,
        },
      },
    ],
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
