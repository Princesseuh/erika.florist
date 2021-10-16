/** @type {import("@types/eslint").Linter.Config */
module.exports = {
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
  ],
  overrides: [
    {
      files: ["./src/scripts/*"],
      env: {
        node: false,
        browser: true,
      },
    },
  ],
}
