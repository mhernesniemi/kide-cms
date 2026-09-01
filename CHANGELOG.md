# Changelog

Notable changes to the Kide CMS template. Scaffolded projects record their source
release in `.kide-version` — diff your project against that tag to see what you've
changed, or against a newer tag to see what upstream has fixed since.

Format: [Keep a Changelog](https://keepachangelog.com). Versions are git tags
(`v<version>`) on this repo; `create-kide-app` scaffolds from the latest tag.

## [0.23.1] - 2026-09-01

### Fixed

- `cms:push --allow-data-loss` no longer crashes with "index … already exists" when a table rebuild
  is involved — drizzle-kit emits each unique index statement twice during a recreate, and the
  duplicate is now dropped before executing. (The failed run rolled back cleanly; no data was at risk.)

## [0.23.0] - 2026-09-01

### Changed

- **Package-mode projects upgrade with plain `pnpm add @kidecms/core@latest`.** `cms:upgrade` in a
  package-mode project now prints that guidance instead of running a patch flow; new package-mode
  scaffolds ship without the `cms:upgrade`/`cms:restore` scripts and without `.kide-version`
  (`create-kide-app` ≥0.4.0). `kide eject` now writes the `.kide-version` stamp (baseline = the
  installed version) and adds the upgrade scripts — the patch flow starts existing exactly when the
  runtime becomes vendored. Check the CHANGELOG on upgrade for schema changes and the rare change to
  project-owned files.

## [0.22.0] - 2026-08-31

> **Schema change** — run `pnpm cms:push` (Cloudflare D1: apply migrations): translations-table
> columns are now plain nullable columns.

### Changed

- **`load()` (bulk import) now throws `ImportFailedError` when any document fails to write**, so a
  half-applied import can't end with a success message. The error carries the full report; pass
  `{ throwOnFailed: false }` for the old return-the-report behavior. Dry runs are unchanged.
- Translations tables no longer copy `notNull`/`unique`/`default` from the base field config. A
  translation row is a sparse overlay (readers already skip null), so e.g. a flag-only overlay row
  no longer needs dummy values for required base fields.
- Internal links picked with the document picker now store the document reference (`docId` +
  `collection`) alongside the cached `url` and title. New core helper `resolveLinkUrl(cms, link)`
  resolves the target's current route at render time — links survive slug edits, with the cached
  `url` as fallback for external links, old values, and unpublished/deleted targets. The marketing
  starter's Hero uses it; hand-editing a URL clears the reference.
- `condition` on block sub-fields is honoured: conditional fields show/hide inside the block editor,
  inline content blocks, shared sections and repeater rows, with the same matching rules as the edit
  form. Previously conditions only worked on top-level collection fields.

### Fixed

- `where` on a translatable boolean field with a `locale` no longer throws — the raw-SQL overlay
  branch now binds booleans as 0/1.
- `cms:push --recreate=<slug>` works for slugs that aren't already snake_case (e.g. `front-page`):
  the slug is mapped to its table name the same way the generator does, and identifiers are quoted.

## [0.21.0] - 2026-08-31

> **Schema change** — run `pnpm cms:push` (Cloudflare D1: apply migrations) to create the new indexes.

### Changed

- Admin list columns for `date` fields use the configured admin date format instead of the raw ISO string.
- Every timestamped collection table gets an index on `_updated_at`. Admin lists, the Recent view and
  `sort: { field: "_updatedAt" }` queries no longer full-scan and temp-sort each table per request.
- Recent view: collections with `admin.sidebar: false` are skipped, and only the 50 winning documents are
  loaded (previously 50 full documents per collection were fetched and mostly discarded).
- Relation comboboxes and internal-link pickers search on the server (`/api/cms/admin/search`, now with
  `collection`, `ids` and `limit` parameters and an `href` in results) instead of preloading catalogues:
  the edit page no longer loads 100 documents per relation field and 200 per linkable collection, and
  every document is reachable by typing — not just the newest ones. `loadRelationOptions` /
  `loadMenuLinkOptions` are replaced by `loadRelationMeta` / `loadLinkableCollections`; the
  `LinkOptionGroup` type is now `LinkableCollection` (`{ collection, label }`).
- All relation pickers share one searching combobox (`DocumentCombobox`): relation sub-fields inside
  blocks, inline content blocks, shared sections and repeater rows now use it too (previously a select
  fed from a preloaded list). Search results are ordered by last update, labels for a document's
  existing selections are resolved server-side when the edit form renders, and read-only relation
  fields display document titles instead of an empty select.

## [0.20.0] - 2026-08-20

> **Schema change** — run `pnpm cms:push` (Cloudflare D1: apply migrations) after
> upgrading. The diff is additive (one nullable column plus indexes) and touches no
> existing rows, but comment queries select `edited_at`, so an unpushed database
> will error on them.

### Added

- **Needs you** — a queue of the documents actually waiting on you: your own open
  assignments, plus everything submitted for review if you are an approver. It sits
  above Recent with a count badge, and only appears when collaboration is switched
  on for a collection you can read. `collaboration.assignedTo()` existed and was
  read by nothing; this makes review states into a workflow instead of per-document
  decoration.
- Comments can be edited by their author, with an `(edited)` marker. Deliberately
  author-only — unlike delete, rewriting words that appear under someone else's name
  is not something an approver should be able to do.
- Comment delete is reachable at last. `deleteComment` was implemented and
  authorized end to end but no UI ever called it. Resolve, Edit and Delete now live
  in a per-comment menu.
- Indexes on `cms_locks(collection, document_id)`, on `(_status, _publish_at)` and
  `(_status, _unpublish_at)` for drafts-enabled collections, and on
  `cms_collaboration(editor)` / `(review_state)`. Every one backs a query the CMS
  runs on its own — lock acquisition on each edit-page open, the publish sweep on
  each cron tick, the nav badge on each admin render — and each was a full scan.

### Changed

- **A failed save now points at the field that caused it.** The error carries the
  field name, so the admin expands the field's group if collapsed, scrolls to it,
  focuses it, and marks it invalid until you start typing. Previously a transient
  toast was the only clue, and the field could be inside a collapsed panel.
- Validation messages read as labels: "Title is required." rather than
  `Field "title" is required.`
- Native browser validation bubbles are suppressed in favour of the admin's own
  reporting. The browser's constraint engine still runs (`required`, `maxlength`,
  `type=email`); only its presentation is replaced, so the same missing field looks
  identical whether the browser or the server caught it.
- First-run setup is gated on an **admin** existing rather than any user at all.
  An invite that created an editor before the first admin would otherwise leave a
  project permanently redirected to a login it had no account for.
- Assignee menu: one row per person. "Assign to me" is a distinct action above a
  separator rather than a duplicate of your own roster entry, and the empty state
  reads "No assignee" with a placeholder avatar instead of "none".
- Comment composer grows with its content instead of scrolling a one-line field;
  Shift+Enter inserts a newline.
- Collaboration rows and comments are removed when their document is deleted. They
  outlived it before, and an orphaned review row still counted toward the badge.

### Fixed

- `indexed` is no longer documented as a field option in `CLAUDE.md` or the public
  field reference — it was never implemented in `BaseFieldConfig` or the generator.
- Removed a stray `admin/components/Untitled` file that was accidentally committed
  and shipped inside the npm package in 0.19.0 and 0.19.1.

## [0.19.1] - 2026-08-20

### Changed

- Assets: the filter/upload row is now sticky, and selecting assets swaps the
  Upload button for the selection count and its Delete/Cancel actions instead of
  inserting a separate toolbar above the grid. The row is a permanent element
  whose contents change, so selecting no longer shifts the grid down, and the
  actions stay reachable while scrolling. The row carries a bottom border and a
  hairline background bleed so thumbnails scrolling underneath do not show
  through at its edges.

## [0.19.0] - 2026-08-20

### Added

- Asset delete-safety. `assets.delete()` now refuses to delete an upload that is
  still referenced and throws `AssetInUseError` (carrying the list of documents)
  unless called with `{ force: true }`; `DELETE /api/cms/assets/:id` answers
  **409** with the same payload, and `?force=1` proceeds. The check lives in core
  because the endpoint is reachable directly, not only through the admin.
- `findAssetUsage()` / `countAssetUsage()` — where an upload is used. Candidate
  columns are derived from the collection config (`image` fields match exactly,
  JSON-serialized fields by substring), and the scan covers translations tables
  and the `_published` snapshot, so an image that survives only in published
  content still counts as used.
- `GET /api/cms/asset-usage` — `?id=` for the detail list, `?ids=` for batch
  counts. Deliberately outside `/api/cms/assets/…`, where a static segment is
  shadowed by the `[id]` route whenever it is not registered.
- Admin: the asset edit page gained a "Used in" card listing the documents that
  reference it; the assets grid warns before bulk-deleting anything still in use.
- Indexes on `cms_assets.storage_path`, `.hash`, and `.folder` — `findByUrl` runs
  on every image render and had none.

### Changed

- **Breaking:** `cmsImage()` is now `cmsImageUrl()`, and `<CmsPicture>` is now
  `<CmsImage>` (`src/components/CmsImage.astro`). Renaming both makes the split
  legible: `<CmsImage>` is how you render an image, `cmsImageUrl()` is for when
  you need a URL string instead of an element (og:image, CSS `background-image`,
  JSON-LD, email). Update imports — `cmsSrcset` is unchanged.
- A deleted or missing upload no longer renders a broken image. `<CmsImage>`
  renders nothing when the asset is gone, and `stripMissingAssetImages()` drops
  dead inline images from rich-text and content fields before rendering.
- **Breaking:** `findAssetUsage()` returns `{ refs, incomplete }` and
  `countAssetUsage()` returns `{ counts, incomplete }`. `incomplete` names
  collections that could not be searched, so a caller can never read a partial
  scan as "unused" — `assets.delete()` now refuses in that case too, and the
  delete dialogs say so rather than staying silent.
- Delete dialogs report the outcome of the reference check in every case — used,
  not used, or could not be checked. Previously a failed lookup was swallowed and
  looked identical to "nothing references this".

### Fixed

- `cms:push` no longer refuses additive schema changes. drizzle-kit's
  `hasDataLoss` covers the whole diff including the runtime FTS search tables,
  which `push.ts` already filters out of what it executes — so any additive
  change made while a search index existed was blocked with a "this diff loses
  data" message listing only harmless statements.
- `dev:preview` clears Vite's prebundle cache when `pnpm install` relinks
  `node_modules` without changing the lockfile. The stale cache broke hydration
  across every admin island and survived server restarts, since Vite keys the
  cache on the lockfile.
- `dev:preview` restarts the preview server when the integration changes or a new
  route file appears. Injected routes are registered once at
  `astro:config:setup`, so a synced-in route was silently absent until a manual
  restart, and requests fell through to whatever else matched.

## [0.18.1] - 2026-08-20

### Added

- Marketing starter: the posts `body` content field now offers the `cta` and
  `form` blocks inline, same as pages.

### Changed

- Marketing starter: the Submissions list no longer shows a "New Submission"
  button — submissions only ever come from the public form endpoint, so the
  collection now declares `access: { create: () => false }`.

### Fixed

- Admin thumbnails respect the asset's focal point everywhere: the media
  library browse dialog and the image field preview now steer their
  `object-cover` crop with `object-position`, matching the assets grid.
- Bulk asset uploads report completion with the standard floating toast instead
  of inline text above the grid.
- Menus editor: the internal-link picker regained its compact size and correct
  row proportions (a link-field restyle had squeezed it, which also narrowed
  the results dropdown). The picker now accepts caller styling overrides.
- Marketing starter: the form block aligns with the content column instead of
  centering itself mid-page.

## [0.18.0] - 2026-08-19

### Added

- Form submissions now behave like an inbox: opening a `new` submission
  automatically marks it `read` (system-side, like email), and the submission
  view's dead Save button was replaced with an Archive / Unarchive action. The
  `status` field was previously unreachable — nothing could ever leave "new".
- Marketing starter: a `form` block. Editors can place any admin-built form on
  the front page or inline in page content via a relation picker; rendering
  delegates to the existing `CmsForm` component.
- Link fields: the picked document's title is stored alongside the URL, and an
  empty Label now falls back to it at render time. Picking a document no longer
  overwrites a label you typed.

### Changed

- Marketing starter: the hero block uses a structured link field (internal
  document picker) for its CTA instead of hand-typed label/href text fields,
  and renders as a full-width light grey band. The CTA block is a rounded card
  and the full-bleed divider lines between blocks are gone.

### Fixed

- Link field layout: Link and Label sit on one row with fixed column widths — a
  long picked document title truncates instead of inflating the picker (grid
  `minmax(0, …fr)` tracks plus a `min-w-0` on the picker row). The picker
  trigger also matches standard field height and background now, and the
  redundant `(internal)`/`(external)` hint is gone.

## [0.17.1] - 2026-08-19

### Changed

- Marketing starter: regular pages now use a `content` field — prose-first
  editing with an inline `cta` block — instead of the `blocks` builder; the
  front page keeps the full block builder. The CTA block was restyled from a
  full-bleed band into a simple rounded card inside the content column.

### Fixed

- Live preview now works when the preview tab is opened **after** edits were
  made. The preview page announces itself on the `cms-preview` channel and the
  admin form replays every field's current (unsaved) value — simple fields,
  rich text, content, and blocks. Previously only the open-preview-first order
  streamed changes.
- A content document ending with a block no longer stores the editor's trailing
  cursor paragraph, which rendered as visible empty space under the block on
  the public site. The renderer also trims trailing empty paragraphs from
  already-saved documents.
- Inline block cards in the content editor now match the standalone blocks
  editor styling — card background, header treatment, bordered type badge, and
  the whole header row toggling expand/collapse — instead of a washed-out
  variant with a selection ring.
- Command menus (search palette, select fields): the keyboard-focused item now
  has a visible background. `--accent` was identical to the near-white
  `--muted`, making focus practically invisible in light mode.
- `kide mcp`: a `no such table: cms_*` error now explains that the database
  schema is out of sync with the CMS config and points to `pnpm cms:push`.

## [0.17.0] - 2026-08-18

### Added

- The dev server now watches the `collections/` directory, not just
  `cms.config.ts`: adding, editing, or deleting a collection file regenerates
  `.generated/` and pushes the schema automatically. Previously a field edit
  inside an existing collection file showed up in the admin form (Vite module
  reload) while the database column and validators lagged behind until
  `cms.config.ts` itself changed.

### Fixed

- `kide mcp` picks up schema changes without a client reconnect. The stdio
  server read `cms.config.ts` and the generated API once at startup, so a
  collection added mid-session stayed invisible to MCP tools ("Unknown
  collection") until the client reconnected. The project modules now load in a
  child process that is respawned on the next tool call after `cms.config.ts`,
  `collections/`, or `.generated/api.ts` change on disk. A broken config no
  longer prevents the server from starting either — tool calls report the load
  error until it's fixed.

## [0.16.3] - 2026-08-17

### Fixed

- Identical field classes could render visibly different background colors
  (single-digit hex differences, e.g. the content editor vs. plain inputs in
  dark mode): translucent fills composite differently across browser paint
  layers (a `backdrop-filter` child promotes its container to its own layer).
  Field surfaces now use precomputed **opaque** tokens — `--field` and
  `--field-subtle` in `src/styles/admin.css` — so every field, empty state,
  table, and picker renders the exact same pixel value by construction.

### Changed

- Extended color palette cleaned up: six dead tokens removed
  (`foreground-secondary`, `foreground-tertiary`, `hover`, `input-border`,
  `destructive-subtle`, `accent-subtle`) and the survivors renamed to the same
  bare-name convention as the shadcn tokens (`--surface`, `--muted-strong`,
  `--placeholder`, `--field`, `--field-subtle`), with `--color-*` names living
  only in the `@theme inline` mapping. If your custom fields referenced the
  removed tokens, define them in your own `admin.css`.

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
