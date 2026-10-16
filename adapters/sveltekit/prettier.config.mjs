/** @type {import("prettier").Config} */
export default {
  printWidth: 120,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: "*.svelte",
      options: {
        parser: "svelte",
      },
    },
  ],
};
