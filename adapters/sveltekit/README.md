# SvelteKit target

Project files for running Kide in a SvelteKit app instead of Astro. create-kide-app's `--framework=sveltekit` assembles a project from them, and `node scripts/verify-sveltekit.mjs` lays them over this repo (dropping the Astro userland) to build, boot and probe the result.

## How it works

The CMS itself is unchanged — `src/cms/` is the same package in both hosts. SvelteKit only needs:

- `vite.config.ts`: `kideSvelteKit()` from `@kidecms/core/sveltekit` next to `sveltekit()`. It wires the `virtual:kide/*` modules, builds the admin bundle, compiles the admin's React JSX, runs the generator, and in dev creates/syncs the database and watches the schema.
- `src/hooks.server.ts`: re-exports `handle` from `@kidecms/core/sveltekit/hooks`, which runs Kide's middleware on every request and answers `/admin/*`, `/api/cms/*` and `/uploads/*` itself. Compose with your own hooks via `sequence()`.
- `src/lib/kide/BlockRenderer.svelte` / `ContentRenderer.svelte`: the site's renderers, also used by live preview. They take data already resolved on the server — call `resolveBlocks(cms, …)` / `resolveContent(cms, …)` from `@kidecms/core` in your `load` functions.
- `src/routes/+layout.svelte` imports `@kidecms/core/client/preview` in the browser for live preview and the edit bar.

Live preview swaps server-rendered HTML into `[data-cms]` regions, so Svelte components inside them show the draft but are not hydrated: an interactive block stays static in the preview tab until the editor saves, which reloads the page.

`package.patch.json` lists the dependency and script changes against the Astro template.

## Deploying

Start the production server with `pnpm start` (`server.js`): it raises adapter-node's request body limit (`BODY_SIZE_LIMIT`, 512K by default) to clear Kide's own upload limits, which `node build` alone would not. `@sveltejs/adapter-node` derives the request origin from the `Host` header and assumes `https` unless `paths.origin` is set. Behind a TLS proxy that's correct; for plain http, set `paths.origin` (in `sveltekit({ paths: { origin } })`), or same-origin form posts are rejected as cross-site. SvelteKit's CSRF check runs before any hook and rejects a cross-site `POST` with no `Content-Type`, so point schedulers at `GET /api/cms/cron/*`, or send `Content-Type: application/json`. Production also needs `KIDE_AUTH_SECRET`, and the database schema pushed (`pnpm cms:push`) — dev pushes on start, production never does.

## Cloudflare

`cloudflare/` swaps in `@sveltejs/adapter-cloudflare` and a `wrangler.toml` (D1, R2, static assets, the publishing cron), alongside the same D1 `drizzle.config.ts` and platform-selector flip the Astro Cloudflare target uses. `kideSvelteKit({ platform: "cloudflare" })` builds the server for workerd (dependencies bundled, `process.env` kept for `nodejs_compat_populate_process_env` secrets) and, after the adapter runs, wraps its worker with the `scheduled()` handler that drives scheduled publishing. `src/cloudflare.d.ts` declares the binding types from the module form of `@cloudflare/workers-types`, whose global form clashes with the DOM types `pnpm check` uses. The `[alias]` entries stub Node-only modules Kide loads lazily (`sharp`, `wrangler`) so the Worker bundles.

`node scripts/verify-sveltekit.mjs --target=cloudflare` builds it, applies migrations to local D1, and drives the Worker under `wrangler dev`, including the cron trigger.

## Starters

`starters/sveltekit/<name>/` holds the Svelte port of a starter's pages and blocks; `--starter=<name>` applies it with the starter's shared content model and seed.
