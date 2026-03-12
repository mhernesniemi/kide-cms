// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, memoryCache } from "astro/config";
import cmsIntegration from "./src/cms/integration";

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
    routeRules: {
      "/blog/**": { maxAge: 300, swr: 60 },
      "/": { maxAge: 300, swr: 60 },
    },
  },
});
