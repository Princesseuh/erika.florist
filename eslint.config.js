// @ts-check
import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptEslint = tseslint.plugin;
const tsParser = tseslint.parser;

export default tseslint.config(
	{
		ignores: [
			"**/node_modules",
			"**/dist",
			"dist/**/*",
			"**/node_modules",
			"**/target",
			"**/.vercel",
			"**/.astro",
			"**/.github",
		],
	},
	eslint.configs.recommended,
	// Maybe enable it one day when I feel like fixing all the errors
	// ...tseslint.configs.strictTypeChecked,
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				// projectService: true, // Ecosystem is not ready for this yet.
				project: ["./tsconfig.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": typescriptEslint,
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					ignoreRestSiblings: true,
				},
			],

			// Cause a weird error in the Tailwind config I don't understand
			"@typescript-eslint/unbound-method": "off",
		},
	},

	// astro-eslint-plugin's types are not up to date
	// https://github.com/ota-meshi/eslint-plugin-astro/issues/411
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	...eslintPluginAstro.configs.recommended,

	// Remove some safety rules around any for various reasons
	{
		files: [
			"**/*.astro", // Disabled because eslint-plugin-astro doesn't type Astro.props correctly in some contexts, so a bunch of things ends up being any
			"api/add/script.js", // Script is in JSDoc and interact with an API, some things are any because I can't be bothered
			"scripts/**/*.ts", // Interact with untyped APIs a bunch, can't be bothered
		],
		rules: {
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},

	// Disable typed rules for scripts inside Astro files
	// https://github.com/ota-meshi/eslint-plugin-astro/issues/240
	{
		files: ["**/*.astro/*.ts"],
		languageOptions: {
			parserOptions: {
				project: null,
			},
		},
		...tseslint.configs.disableTypeChecked,
	},

	// Those files run in the browser and need the browser globals
	{
		files: ["src/assets/scripts/*", "api/**/*.js"],
		languageOptions: {
			globals: {
				...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, "off"])),
				...globals.browser,
			},
		},
	},
);
