import markdoc from "@astrojs/markdoc";
import tailwind from "@astrojs/tailwind";
import expressiveCode from "astro-expressive-code";
import { defineConfig } from "astro/config";
import { rename } from "node:fs/promises";

import db from "@astrojs/db";

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
		// HACK: Could be nicer with https://github.com/withastro/roadmap/discussions/643
		// ... but could be even nicer with a way to render Markdoc directly in an endpoint, ha.
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
		db(),
	],
	experimental: {
		contentIntellisense: true,
	},
});
