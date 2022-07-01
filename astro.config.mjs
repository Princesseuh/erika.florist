import { defineConfig } from "astro/config"
import tailwind from "@astrojs/tailwind"
import AutoImport from "astro-auto-import"

// https://astro.build/config
export default defineConfig({
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
  integrations: [
    tailwind(),
    AutoImport({
      imports: [
        {
          // Explicitly alias a default export
          // generates:
          // import { default as B } from './src/components/B.astro';
          "./src/components/MarkdownImage.astro": [["default", "Image"]],
          "./src/components/MarkdownNoteBlock.astro": [["default", "Blocknote"]],
        },
      ],
    }),
  ],
  vite: {
    optimizeDeps: {
      exclude: ["astro-eleventy-img"],
    },
    ssr: {
      external: ["svgo", "@11ty/eleventy-img"],
    },
    plugins: [],
  },
})
