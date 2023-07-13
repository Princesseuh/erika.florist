/** @type {import("prettier").Options} */
export default {
  printWidth: 100,
  tabWidth: 2,
  trailingComma: "all",
  semi: true,
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  astroAllowShorthand: false,
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
};
