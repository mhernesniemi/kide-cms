# Changelog

Notable changes to the Kide CMS template. Scaffolded projects record their source
release in `.kide-version` — diff your project against that tag to see what you've
changed, or against a newer tag to see what upstream has fixed since.

Format: [Keep a Changelog](https://keepachangelog.com). Versions are git tags
(`v<version>`) on this repo; `create-kide-app` scaffolds from the latest tag.

## [0.16.2] - 2026-08-17

### Removed

- `database.dialect`/`database.url` config and the field-level `indexed` option:
  both were accepted but never consumed anywhere — `"postgres"` in particular
  implied support that never existed. The database engine is entirely determined
  by the project's `adapters/db.ts`, not a declared dialect. Existing configs
  with `database: { dialect: "sqlite" }` or `indexed: true` on a field just drop
  the line — neither ever had any effect.

### Changed

- Dark-mode input/textarea/select/checkbox fills had much higher contrast against
  the page background than their light-mode equivalents (roughly 10x, from a
  token that's also shared with the border color). Toned down to ~3.5x — still
  visible, no longer the odd one out between themes.
- Dark-mode outline/input-styled buttons share that same fill token, but a
  button needs to read as clickable, not recede like a field — bumped their
  fill back up (independent from the form-control value) so they don't blend
  into the page in dark mode.

## [0.16.1] - 2026-08-17

### Fixed

- Files uploaded after `astro build` 404d in production on the Node target: static
  serving only knows files present at build time. `/uploads/*` is now served
  through the storage adapter on every platform (previously a Cloudflare-only
  route). The storage contract gains an optional `getFileStream` — wired in the
  template's `runtime.ts` (package-mode upgrades see this one-line addition in
  careful-review); custom adapters without it are served buffered via `getFile`.
- Booting a production build against a database with no schema (e.g.
  `pnpm build && pnpm preview` before any `pnpm cms:push`) redirected to
  `/admin/setup`, which then crashed against the missing tables. The middleware
  now returns a clear 503 telling you to run `pnpm cms:push`.

## [0.16.0] - 2026-08-17

### Added

- Edit bar: logged-in editors browsing the public site get a floating "Edit this
  page" chip linking straight to the document's edit view. Pages opt in by
  rendering `data-cms-doc="<collection>:<id>"` (the marketing starter wires its
  front page, pages, and posts). Anonymous visitors pay nothing: the injected
  client only acts on a non-sensitive hint cookie set during admin visits, then
  verifies the real session against a new `/api/cms/edit-bar` endpoint. The chip
  is client-injected, so cached public HTML stays identical for everyone.
  Disable with `admin.editBar: false`.

### Changed

- The URL column now links published documents to their live page and only uses
  `?preview=true` for never-published drafts (which have no live page). Checking
  "is my change live?" from a list view now shows the real site, not draft state.
- The assets bulk-selection toolbar stays pinned to the top of the viewport while
  scrolling a long grid.
- Destructive buttons (Delete, Discard changes) got a visible border matching
  their fill and higher-contrast text, aligning them with the other button
  variants in both themes.

## [0.15.0] - 2026-08-17

### Added

- Drag-and-drop upload on the assets page: drop files from your file manager anywhere
  on the page to upload them into the open folder. Uses the same pipeline as the
  Upload button (progress, single-upload redirect, bulk notice), and never triggers
  from the existing drag-to-folder sorting of asset cards.
- List views show a URL column for collections with a public route (`preview` or
  `pathPrefix`): the document's live path as a link that opens in preview mode, with
  `/` shown as "Homepage". Part of the default columns; when overriding
  `views.list.columns`, opt in with `"__page"`. The Singles view has the same column.
- Default list columns now include Created At (skipped for `timestamps: false`
  collections).
- `pnpm dev:preview` — a repo-local sandbox that assembles a starter into a sibling
  project, seeds it, and live-syncs source edits into it. For working on the admin
  against realistic content; excluded from scaffolded projects.

### Changed

- Admin responsive behavior reworked: the nav sidebar collapses into the mobile
  drawer below 1400px (was 1024px), the edit view keeps its two-column field layout
  down to 1024px (was 1536px), and the edit-view header stacks title and actions on
  narrow screens instead of truncating the title.
- The admin's `2xl` breakpoint is now 100rem/1600px (was 96rem/1536px), so the
  roomier wide-screen spacing no longer triggers at ~110% browser zoom on a laptop.
  Kept in rem deliberately: mixing units across breakpoints breaks Tailwind v4's
  variant ordering, leaving the overridden tier silently losing the cascade.
- Edit-view body padding is symmetric left/right (the left edge was wider at 2xl).
- Single-file uploads land on the new asset's detail page again; bulk uploads show
  upload progress and a completion notice instead of silently refreshing the list.
- Asset-grid thumbnails crop around the asset's focal point when one is set.
- Menu/taxonomy item editor inputs share one height and a lighter background
  (label, link-type select, URL input, and document picker no longer mismatched).
- Singles view columns renamed and reordered to match list views (URL instead of
  API slug, "Updated At").

### Fixed

- Hover-revealed controls (image-field remove button, asset-card selection checkbox
  and drag handle) were invisible when focused via keyboard — now revealed on focus.
- Recent and Singles views always showed a Locales column, even in single-locale
  projects; now gated the same way as collection list views.
- In dev, uploading a single asset redirected to its detail page before Vite had
  picked up the file, rendering a broken image until manual refresh. The settle
  delay now covers the XHR flow (and production skips it entirely).

## [0.14.3] - 2026-08-15

### Fixed

- `@kidecms/core` on npm had no README, no keywords, and its homepage link pointed at
  the monorepo's README anchor. Added a package-scoped `README.md` and `LICENSE`
  (`verify-pack.mjs` already allowed both at the package root; they were never
  created), keywords for npm search, and `homepage`/`bugs` fields.

## [0.14.2] - 2026-08-15

### Fixed

- Draft (`?preview`) responses could be cached by Astro's route caching and served to
  anonymous visitors, or a stale cached redirect could make the editor's own preview
  tab appear broken for up to 24h. The auth middleware now disables caching on every
  `?preview` request after the page renders, regardless of what the page itself does.
- `/blog/**` in `astro.config.mjs` used glob syntax, which Astro 7 route rules don't
  support — blog caching silently never activated. Fixed to `/blog/[...slug]`.
- The generic `findOne({ where: {...} } )` mistake (the flat-filter shape `find` uses,
  not `findOne`) existed in two runtime call sites — the forms submit endpoint and the
  admin's shared-block form lookup — both silently returning the first row instead of
  the requested one once more than one row exists. Fixed both call sites.
- Login page now shows a message for the rate-limited error case (previously silent)
  and a generic fallback for any other error code.

### Changed

- Blank template landing page (`src/pages/index.astro`) restyled: removed the stray
  Astro logo (leftover from the base template, not a Kide mark), and reworked as a
  centered light layout in the spirit of Payload's welcome screen.
- **Marketing starter**: reworked front page as a proper `front-page` singleton
  (was a `pages` doc with a magic `home` slug); moved sidebar placement for
  `form-submissions` under Library (was showing under Content); gave `features`/`faq`
  repeater fields explicit `itemFields` instead of relying on a legacy auto-detect
  fallback; visual restyle (grayscale, no eyebrow field, section dividers); added
  `afterUnpublish` cache invalidation to all content collections; `submitRedirect`
  now sanitized with `safeUrl`; submission `data` field is now truly read-only.

## [0.14.1] - 2026-08-14

### Fixed

- Cloudflare deploys crashed on setup/login: production Workers rejects PBKDF2
  above 100k iterations (local `wrangler dev` doesn't enforce the cap). Hashing
  now uses 100k on Workers and 600k elsewhere; the per-hash iteration count
  keeps existing hashes verifying on both runtimes.

## [0.14.0] - 2026-08-14

### Added

- **Starter templates.** `starters/<name>/` overlay directories ship with the template;
  `create-kide-app` lists them from the cloned tag (Blank stays the default). First
  starter: **Marketing site** (pages with blocks, blog + taxonomy, menu, contact form,
  seed content). Verified per release by `pnpm verify:starters`.
- Seed content is project-owned: `kide seed` reads `src/cms/seed.ts` and no longer
  reads `src/cms/internals/seed.data.ts` — move any contents to `src/cms/seed.ts`
  (upgrades route the legacy file to careful review). New root script `cms:seed`.

### Changed

- Minimum password length lowered from 12 to 8 characters.

## [0.13.0] - 2026-08-14

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

- `blocks` is now optional on `fields.content()` — omit it for pure rich text
  (the template's `pages.body` does exactly this).
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
