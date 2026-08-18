import js from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", ".astro/", "docs/", "packages/", "workers/", "starters/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "off",
    },
  },
  {
    files: ["**/*.astro", "**/*.astro/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Standalone Node scripts (build/verify tooling, the kide CLI launcher).
    files: ["scripts/**/*.mjs", "src/cms/internals/cli.mjs", "src/cms/internals/mcp-worker-boot.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        FormData: "readonly",
        Blob: "readonly",
      },
    },
  },
);
