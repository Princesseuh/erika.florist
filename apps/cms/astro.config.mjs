import { defineConfig } from "astro/config"
import netlify from "@astrojs/netlify"

import tailwind from "@astrojs/tailwind"

// https://astro.build/config
export default defineConfig({
  adapter: netlify(),
  integrations: [tailwind()],
  server: {
    port: 3502,
  },
})
