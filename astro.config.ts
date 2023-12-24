import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import AutoImport from "astro-auto-import";
import { defineConfig } from "astro/config";

import expressiveCode from "astro-expressive-code";
import { remarkConvertImports } from "./src/remark-convert-imports.ts";

// https://astro.build/config
export default defineConfig({
	publicDir: "./static",
	site: "https://erika.florist/",
	markdown: {
		syntaxHighlight: "shiki",
		shikiConfig: {
			theme: "material-theme-darker",
			langs: [],
			wrap: false,
		},
		remarkPlugins: [remarkConvertImports],
	},
	image: {
		service: {
			entrypoint: "./src/imageService.ts",
		},
	},
	integrations: [
		tailwind({
			applyBaseStyles: false,
		}),
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
		expressiveCode({
			themes: ["material-theme-darker"],
			plugins: [
				{
					name: "custom-style",
					baseStyles: () => `
            .frame.is-terminal:not(.has-title) .header {display: none;}
            .frame .header {border-bottom: 2px solid #313131;}
            .frame.is-terminal .header::before {display: none;}
            .frame.is-terminal:not(.has-title) {
              --button-spacing: 0.4rem;
            }
            .frame.is-terminal:not(.has-title) code, .frame.is-terminal:not(.has-title) pre {
              border-radius: 4px
            }
            .frame.is-terminal .header {
              justify-content: initial;
              font-weight: initial;
              padding-left: 1rem;
              color: #fff;
            }
            `,
					hooks: {},
				},
			],
			useThemedScrollbars: false,
			useThemedSelectionColors: false,
			styleOverrides: {
				frames: {
					frameBoxShadowCssValue: "none",
					tooltipSuccessBackground: "#e65161",
				},
				uiLineHeight: "inherit",
				codeFontSize: "0.875rem",
				codeLineHeight: "1.25rem",
				borderRadius: "4px",
				borderWidth: "0px",
				codePaddingInline: "1rem",
				codeFontFamily:
					'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
			},
		}),
		mdx(),
	],
});
