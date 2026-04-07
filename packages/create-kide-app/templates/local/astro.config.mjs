// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, memoryCache } from "astro/config";
import cmsIntegration from "@kide/core/integration";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), cmsIntegration()],
  adapter: node({
    mode: "standalone",
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  experimental: {
    cache: {
      provider: memoryCache(),
    },
  },
});
