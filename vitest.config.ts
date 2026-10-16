import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The Astro tsconfig preserves JSX; admin .tsx under test needs React's transform.
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Worker-runtime tests run under vitest.workers.config.ts, not the node pool.
    exclude: ["**/node_modules/**", "**/*.workers.test.ts"],
    // Integration tests share module-level runtime state (initSchema/configureCmsRuntime),
    // so isolate each test file in its own worker.
    isolate: true,
  },
});
