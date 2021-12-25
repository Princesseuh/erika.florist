/** @type {import("@types/prettier").Options */
module.exports = {
  printWidth: 100,
  tabWidth: 2,
  trailingComma: "all",
  semi: false,
  plugins: ["./node_modules/prettier-plugin-astro"],
  astroAllowShorthand: false,
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
}
