# SvelteKit target

Project files for running Kide in a SvelteKit app instead of Astro. Repo-only: `node scripts/verify-sveltekit.mjs` lays them over this repo (dropping the Astro userland) to build, boot and probe the result; create-kide-app does not offer this target yet.

## How it works

The CMS itself is unchanged — `src/cms/` is the same package in both hosts. SvelteKit only needs:

- `vite.config.ts`: `kideSvelteKit()` from `@kidecms/core/sveltekit` next to `sveltekit()`. It wires the `virtual:kide/*` modules, builds the admin bundle, compiles the admin's React JSX, runs the generator, and in dev creates/syncs the database and watches the schema.
- `src/hooks.server.ts`: re-exports `handle` from `@kidecms/core/sveltekit/hooks`, which runs Kide's middleware on every request and answers `/admin/*`, `/api/cms/*` and `/uploads/*` itself. Compose with your own hooks via `sequence()`.
- `src/lib/kide/BlockRenderer.svelte` / `ContentRenderer.svelte`: the site's renderers, also used by live preview. They take data already resolved on the server — call `resolveBlocks(cms, …)` / `resolveContent(cms, …)` from `@kidecms/core` in your `load` functions.
- `src/routes/+layout.svelte` imports `@kidecms/core/client/preview` in the browser for live preview and the edit bar.

`package.patch.json` lists the dependency and script changes against the Astro template.

## Deploying

`@sveltejs/adapter-node` derives the request origin from the `Host` header and assumes `https` unless `paths.origin` is set. Behind a TLS proxy that's correct; for plain http, set `paths.origin` (in `sveltekit({ paths: { origin } })`), or same-origin form posts are rejected as cross-site. Production also needs `KIDE_AUTH_SECRET`, and the database schema pushed (`pnpm cms:push`) — dev pushes on start, production never does.

Not covered yet: the Cloudflare target (the Astro build's `scheduled()` cron patch has no SvelteKit equivalent) and starters (their blocks are `.astro` components).
