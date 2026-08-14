# Starter templates

Each directory here is an overlay that the scaffolder copies **on top of** the barebone template. Files are copied whole — there is no merging — so a starter only ships files that differ from the base or are new.

## Authoring rules

- Overlays may only contain project-owned paths:
  - `src/cms/cms.config.ts`
  - `src/cms/collections/*`
  - `src/cms/seed.ts`
  - `src/pages/**`
  - `src/components/**`
  - `src/layouts/**`
  - `src/styles/**`
- Never ship `package.json`, `astro.config.mjs`, `tsconfig.json`, or anything under `src/cms/{admin,client,core,internals,middleware,platform,routes}` — those are managed by the CMS and would clobber the base.
- Whole-file replacement: if a starter changes one line of a base file, it ships the entire file. If a base file is unchanged, do not include it.
- Every starter has a `starter.json` with `{ "name", "label", "hint", "order" }`. `name` matches the directory, `label` and `hint` are shown by the scaffolder prompt, `order` sorts the list (lower first).
- Pages and components must render without seed content — seeding is optional and an empty database may never produce a 500.
- Starters are validated by `scripts/verify-starters.mjs`: overlay allowlist, `pnpm check` on the assembled project, seed with row-count verification, build.
