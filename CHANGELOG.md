# Changelog

Notable changes to the Kide CMS template. Scaffolded projects record their source
release in `.kide-version` — diff your project against that tag to see what you've
changed, or against a newer tag to see what upstream has fixed since.

Format: [Keep a Changelog](https://keepachangelog.com). Versions are git tags
(`v<version>`) on this repo; `create-kide-app` scaffolds from the latest tag.

## [0.13.0] - Unreleased

### Added

- **Dual distribution.** The CMS runtime is now the `@kidecms/core` package, embedded
  in the repo at `src/cms/` and linked via a pnpm workspace. Projects can scaffold in
  **embedded** mode (runtime source in the tree, as before) or **package** mode (thin
  project + npm dependency). Both modes are the same source at the same tag.
- `kide` CLI bin (`kide generate|push|seed|admin|reindex|describe|upgrade|restore|eject|mcp`)
  replaces the project-relative `node --import tsx src/cms/internals/*.ts` script wiring.
- `kide eject` converts a package-mode project to embedded in place (offline,
  version-exact). One-way by design — evaluate on a branch, or use `pnpm patch`
  for small package-mode tweaks.
- `cms:upgrade` is mode-aware: embedded mode applies the managed-runtime patch as
  before; package mode bumps the `@kidecms/core` version and reserves the packet for
  project-owned template files.
- CI: publish-manifest check (`verify:pack`), package-mode end-to-end smoke test
  including eject (`verify:package`), and a release workflow that publishes
  `@kidecms/core` from `v*` tags.

### Changed

- **Bare-bones template.** The repo's userland is now the scaffold: one
  `pages` collection (`title`, `slug`, `body`), a minimal public page, no demo
  content, no seeds. The demo collections/pages/blocks, seed data, and the
  scaffolder's "seed demo content?" prompt are gone. Core tests run against a
  committed rich fixture schema (`src/cms/core/__tests__/fixtures/`, regenerate
  with `pnpm test:fixtures`) instead of the userland config, so they pass no
  matter what collections a project defines.

- **Breaking (layout):** the runtime composition root moved from
  `src/cms/internals/runtime.ts` to project-owned `src/cms/runtime.ts`; custom admin
  field components moved from `src/cms/admin/fields/` to project-owned `src/cms/fields/`;
  adapters select platforms via `@kidecms/core/platform/...` specifiers instead of
  relative paths.
- **Breaking (imports):** userland imports the CMS library as `@kidecms/core`
  (previously `@/cms/core`); standalone-script bootstrap is `@kidecms/core/context`.
  Managed runtime code uses relative imports internally.
- The Astro integration resolves all runtime files relative to the package
  (`import.meta.url`) instead of the project root, and sets `ssr.noExternal` +
  React `dedupe` for package-mode installs.
- `src/cms/platform/` is now classified as managed in the upgrade path rules;
  `src/styles/admin.css`, `src/cms/runtime.ts`, and `src/cms/fields/` are
  project-owned ("careful").

## [0.10.0] - 2026-06-10

### Added

- Focal-aware server-side image cropping: `transformImage` accepts width+height and
  crops around the asset's focal point (`?w=&h=&fx=&fy=` on `/api/cms/img`).
- Named image presets (`hero`, `banner`, `card`, `square`, `thumb`, `content`, …) with
  optional overrides via `images.presets` in `cms.config.ts`.
- `<CmsPicture>` component: art-directed `<picture>` with per-breakpoint crops,
  AVIF+WebP sources, automatic focal-point resolution, and CLS-safe dimensions.
- Live per-preset crop previews in the asset detail view.
- Intrinsic width/height captured on upload (raster images).
- Test suite (`pnpm test`): unit tests for auth crypto, slug/HTML/rich-text utilities,
  image URL building and crop math; golden-file tests for the code generator; and
  integration tests running the full `createCms` pipeline against in-memory SQLite.
- This changelog, and scaffold provenance stamping (`.kide-version`) via
  `create-kide-app`.

### Fixed

- Path traversal hardening on the public image transform endpoint.
- Rich-text inline images now render as `<picture>` with AVIF+WebP sources.

## [0.9.1]

Baseline release. Code-first CMS inside Astro 6: collections-as-code with generated
Drizzle schema, TypeScript types, Zod validators, and a typed local API; admin UI
(drafts, publishing, scheduling, versions, locks, i18n, asset library with focal
points, AI assistant); FTS5 search; webhooks; audit log; Node.js and Cloudflare
(D1/R2) deploy targets.
