/** @type {import("@types/eslint").Linter.Config} */
module.exports = {
	ignorePatterns: ["node_modules", "dist"],
	root: true,
	env: {
		node: true,
	},
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint", "prettier"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:prettier/recommended",
		"plugin:astro/recommended",
	],
	rules: {
		"@typescript-eslint/no-unused-vars": [
			"warn",
			{ varsIgnorePattern: "Props", ignoreRestSiblings: true },
		],
	},
	overrides: [
		{
			files: ["*.astro"],
			parser: "astro-eslint-parser",
			parserOptions: {
				parser: "@typescript-eslint/parser",
				extraFileExtensions: [".astro"],
			},
			rules: {
				"prettier/prettier": "off",
			},
		},
		{
			files: ["./src/assets/scripts/*", "./api/**/*.js"],
			env: {
				node: false,
				browser: true,
			},
		},
	],
};
