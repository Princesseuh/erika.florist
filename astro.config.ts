import tailwind from "@astrojs/tailwind";
import expressiveCode from "astro-expressive-code";
import { defineConfig } from "astro/config";

import markdoc from "@astrojs/markdoc";
import { rename } from "fs/promises";

// https://astro.build/config
export default defineConfig({
	publicDir: "./static",
	site: "https://erika.florist/",
	image: {
		service: {
			entrypoint: "./src/imageService.ts",
		},
	},
	prefetch: {
		prefetchAll: true,
	},
	integrations: [
		tailwind({
			applyBaseStyles: false,
		}),
		expressiveCode(),
		markdoc({
			allowHTML: true,
		}),
		{
			name: "RSS Generator",
			hooks: {
				"astro:build:done": async (options) => {
					const rssPages = options.pages.filter((page) => page.pathname.includes("rss"));

					for (const { pathname: rssPage } of rssPages) {
						await rename(
							new URL(`${rssPage}index.html`, options.dir),
							new URL(`${rssPage}index.xml`, options.dir),
						);
					}
				},
			},
		},
	],
});
