# Cloudflare adapter overlay

Scaffolding source consumed by [`create-kide-app`](https://github.com/mhernesniemi/create-kide-app) when the Cloudflare option is selected. Not used at runtime.

## How it works

File paths in this folder mirror the project root. When you choose Cloudflare at the interactive "Where will you deploy?" prompt, `create-kide-app` overlays each file onto the generated project, then removes the `adapters/` directory.

- `astro.config.mjs`, `drizzle.config.ts`, `src/cms/adapters/db.ts`, `src/cms/adapters/storage.ts`, `src/cms/adapters/cf-env.ts`, `src/pages/uploads/[...path].ts` — copied verbatim over the defaults.
- `wrangler.toml` — `{{PROJECT_NAME}}` is replaced with the project name.
- `package.patch.json` — describes dep/script changes applied to the project's `package.json` (adds `@astrojs/cloudflare` and `wrangler`, removes `@astrojs/node` and `sharp`, moves `better-sqlite3` to devDependencies, overrides `preview` and `deploy` scripts). Descriptive only; not read by the CLI — the scaffolder hardcodes these edits.

If you clone kide-cms directly (not via `create-kide-app`), you can safely delete this folder.
