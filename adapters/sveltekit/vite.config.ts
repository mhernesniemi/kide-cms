import path from "node:path";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { kideSvelteKit } from "@kidecms/core/sveltekit";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter(), files: { assets: "public" } }), kideSvelteKit()],
  resolve: {
    alias: { "@": path.resolve("src") },
  },
});
