// @ts-check

import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Kide CMS for Astro",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/mhernesniemi/kide-cms" }],
      sidebar: [
        { label: "Getting Started", link: "/" },
        { label: "Collections", slug: "collections" },
        { label: "Fields", slug: "fields" },
        { label: "Local API", slug: "local-api" },
        { label: "Hooks", slug: "hooks" },
        { label: "Webhooks", slug: "webhooks" },
        { label: "Access Control", slug: "access-control" },
        { label: "Public Pages", slug: "public-pages" },
        { label: "Admin UI", slug: "admin-ui" },
        { label: "Assets", slug: "assets" },
        { label: "Authentication", slug: "authentication" },
        { label: "Deploy", slug: "deploy" },
      ],
    }),
  ],
});
