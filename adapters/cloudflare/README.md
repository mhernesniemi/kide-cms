# Cloudflare target config

Config-only scaffolding consumed by [`create-kide-app`](https://github.com/mhernesniemi/create-kide-app) when the Cloudflare option is selected. Not used at runtime.

## How it works

The Cloudflare runtime implementations (D1 database, R2 storage, `cf-env`, the `/uploads/*` route) live **in the tree** at `src/cms/platform/cloudflare/`, alongside the Node profile at `src/cms/platform/node/`. Nothing is copied over source files. When you choose Cloudflare at the interactive "Where will you deploy?" prompt, `create-kide-app`:

- Copies `astro.config.mjs` (uses the Cloudflare adapter + `cmsIntegration({ platform: "cloudflare" })`) and `drizzle.config.ts` (D1 dialect) over the defaults.
- Flips the two platform selectors — `src/cms/adapters/db.ts` and `src/cms/adapters/storage.ts` — to re-export the `platform/cloudflare` profile (one line each).
- Processes `wrangler.toml` (`{{PROJECT_NAME}}` → the project name).
- Patches `package.json` (adds `@astrojs/cloudflare` + `wrangler`, removes `@astrojs/node` + `sharp`, moves `better-sqlite3` to devDependencies, overrides `preview`/`deploy`).

`package.patch.json` documents those dependency changes; it is descriptive only — the CLI applies them directly.

If you clone kide-cms directly (not via `create-kide-app`), you can safely delete this folder — the Node profile is the default.
