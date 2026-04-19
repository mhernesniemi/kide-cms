// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import cmsIntegration from "./src/cms/integration.ts";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), cmsIntegration()],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
