// @ts-check
import eslint from "@eslint/js";
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

	// Remove some safety rules around any for various reasons
	{
		files: [
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
