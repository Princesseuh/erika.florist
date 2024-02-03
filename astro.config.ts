import tailwind from "@astrojs/tailwind";
import expressiveCode from "astro-expressive-code";
import { defineConfig } from "astro/config";

import markdoc from "@astrojs/markdoc";

// https://astro.build/config
export default defineConfig({
	publicDir: "./static",
	site: "https://erika.florist/",
	image: {
		service: {
			entrypoint: "./src/imageService.ts",
		},
	},
	integrations: [
		tailwind({
			applyBaseStyles: false,
		}),
		expressiveCode(),
		markdoc({
			allowHTML: true,
		}),
	],
});
