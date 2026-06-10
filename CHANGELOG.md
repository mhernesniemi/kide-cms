# Changelog

Notable changes to the Kide CMS template. Scaffolded projects record their source
release in `.kide-version` — diff your project against that tag to see what you've
changed, or against a newer tag to see what upstream has fixed since.

Format: [Keep a Changelog](https://keepachangelog.com). Versions are git tags
(`v<version>`) on this repo; `create-kide-app` scaffolds from the latest tag.

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
