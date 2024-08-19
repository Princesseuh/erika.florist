// @ts-check
import globals from "globals";
import tseslint from "typescript-eslint";

const typescriptEslint = tseslint.plugin;
const tsParser = tseslint.parser;

export default tseslint.config(
	{
		ignores: [
			"**/*.astro", // TODO: eslint-plugin-astro seems to be broken with typescript-eslint's latest version, wonky.
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

			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",

			"@typescript-eslint/no-misused-promises": [
				"error",
				{
					checksVoidReturn: false,
				},
			],

			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	// See TODO above.
	// ...eslintPluginAstro.configs.recommended,
	{
		files: ["./src/assets/scripts/*", "./api/**/*.js"],
		languageOptions: {
			globals: {
				...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, "off"])),
				...globals.browser,
			},
		},
	},
);
