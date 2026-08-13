// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import cmsIntegration from "@kidecms/core/astro";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), cmsIntegration({ platform: "cloudflare" })],
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
