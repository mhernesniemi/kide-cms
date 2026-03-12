/** @type {import("prettier").Config} */
export default {
  printWidth: 120,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  plugins: ["prettier-plugin-astro"],
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
};
