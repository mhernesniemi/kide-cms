# Kide CMS

Code-first, single-schema CMS built inside Astro 7. Runtime, admin UI, routes, and middleware all live inside `src/cms/`. No external package boundary — own your code.

## Repo Structure

```
src/
  cms/
    cms.config.ts         # CMS configuration (collections, admin, locales)
    collections/          # Collection definitions
    adapters/             # db, email, storage adapters
    internals/            # Thin runner scripts + integration.ts + virtual.d.ts (not user-edited)
    migrations/           # Drizzle migrations
    .generated/           # Auto-generated schema/types/validators/api (do not edit)
    core/                 # CMS runtime library (define, api, auth, schema, content, ...)
    admin/                # Admin UI (components, layouts, lib)
    routes/               # Admin pages + API routes (injected by integration)
    middleware/           # Auth middleware (injected by integration)
    client/               # preview.ts — browser-side live-preview client
  components/             # App-level components (incl. BlockRenderer)
  layouts/, pages/, styles/, env.d.ts
```

(The Starlight docs site lives in a separate `kide-cms-docs` repo, not inside this project.)

## Commands

```bash
pnpm dev              # start dev server foreground (auto-generates schema + pushes DB)

# Background dev server (Astro 7) — preferred when working as an agent: it blocks
# until the server is ready (schema gen + DB push finish before it detaches), prints
# the URL + PID, then detaches. A lockfile dedupes, so re-running returns the existing
# instance instead of spawning a second writer on data/cms.db.
pnpm exec astro dev --background    # start detached
pnpm exec astro dev status          # is a server already running?
pnpm exec astro dev logs --follow   # tail background server logs
pnpm exec astro dev stop            # stop the background server
pnpm build            # production build
pnpm preview          # preview production build
pnpm check            # astro check (types) + eslint (lint)
pnpm test             # vitest (unit + generator golden + in-memory DB integration)
pnpm format           # prettier --write .
pnpm cms:generate     # regenerate src/cms/.generated/ from cms.config.ts
pnpm cms:seed         # seed database with demo content
pnpm cms:admin        # create an admin user from CLI
pnpm cms:describe     # write .kide/model.json + MODEL.md (the migration model manifest)
pnpm cms:upgrade      # in scaffolded client projects: prepare/apply a release-tag core upgrade packet
```

> **Migrating content in?** Read `AGENTS.md` (repo root) and run the `/migrate` skill. The short version: `pnpm cms:describe` → read `MODEL.md` → write an importer that matches the value shapes → `createCmsContext().load(items, { dryRun: true })` to validate → import → verify.

> **Upgrading a scaffolded client project?** Run `pnpm cms:upgrade <target-tag>` from the client project. It reads `.kide-version`, writes `.kide/upgrade/<from>-to-<to>/`, applies only managed runtime paths when the worktree is clean, and leaves project-sensitive files in `careful-review.patch`. Claude/Codex/Cursor should read `agent-instructions.md` from that packet and finish the merge from there. If no local agent exists, the packet is still complete for manual review.

## Validation (IMPORTANT)

After code changes, ALWAYS run:

1. `pnpm check` — Fix all errors before considering the task done.
2. `pnpm test` — All tests must pass. Add tests when changing `src/cms/core/`.
3. `pnpm format` — Must be the very last step.

> **Known pre-existing `pnpm check` errors:** `astro check` reports ~6 errors confined to `adapters/cloudflare/` (missing Cloudflare ambient types — `R2Bucket`, `D1Database`, `cloudflare:workers`, `@astrojs/cloudflare`). That adapter is meant to be consumed inside a Cloudflare project where those types exist; they are not resolvable in the base repo. Treat them as baseline noise — verify your change adds **zero new errors** outside `adapters/cloudflare/` rather than expecting a fully clean run.

## Key Files

| File                               | Purpose                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `src/cms/cms.config.ts`            | Top-level CMS config — collections, admin, locales    |
| `src/cms/collections/`             | Collection schemas                                    |
| `src/cms/adapters/`                | Project-specific db / email / storage adapters        |
| `src/cms/internals/`               | Thin runner scripts (runtime wiring, generator, etc.) |
| `src/cms/internals/integration.ts` | Astro integration (route injection, virtual modules)  |
| `src/cms/core/`                    | CMS runtime library (edit to change behavior)         |
| `src/cms/admin/`                   | Admin UI components, layouts, styles                  |
| `src/cms/routes/`                  | Admin pages + API routes injected by integration      |
| `src/cms/middleware/`              | Auth middleware injected by integration               |
| `src/cms/client/`                  | Browser-side live-preview client                      |

## Rules

- Use **pnpm** for all package management and scripts (`pnpm install`, `pnpm add`, `pnpm exec`, etc.). Do not use npm or yarn.
- Never edit `src/cms/.generated/` files — they're overwritten on every generation.
- DB columns use `snake_case`, TS fields use `camelCase`. System fields prefixed with `_`.
- Rich text is JSON AST, never HTML or Markdown in storage.
- Admin styles use shadcn CSS variables. Public site uses plain Tailwind colors — no shared styles.
- `labelField` on collections controls display name (fallback: title → name → first text field).
- Always query content through the typed local API (`cms.posts.findOne()`, `cms.pages.find()`, etc.) — never bypass it with raw DB queries or untyped wrappers.
- Routes in `src/cms/routes/` import app-specific code via `virtual:kide/*` modules (resolved by the integration's Vite aliases). Userland (`src/pages/`, `src/layouts/`, `src/components/`) imports directly via `@/cms/*` — virtual is the one-way core → user contract, don't use it in userland.
- Use the `cn()` utility from `@/cms/admin/lib/utils` for conditional class names — never use template literal interpolation for className.
- Import the CMS library via the `@/cms/core` alias (tsconfig `@/*` → `./src/*`), not relative paths.
- Prefer the Astro 7 **background dev server** (`pnpm exec astro dev --background`) over a foreground `pnpm dev`: it detaches once ready, dedupes via a lockfile, and is stoppable with `pnpm exec astro dev stop`. Either way, stop the server when you're done (`pnpm exec astro dev stop`, or kill the foreground process).

## Migrations & Bulk Import

Guidance for importing external content (e.g. a WordPress dump) or running one-off bulk maintenance. Stay on the typed local API and keep re-runs idempotent.

**1. Sync the schema.** After editing `collections/`, run:

```bash
pnpm cms:generate && pnpm cms:push
```

`cms:push` (`internals/push.ts`) applies the generated Drizzle schema to the local SQLite DB without a TTY for **additive** changes (new tables/columns) and skips the lazily-created FTS `cms_search_index*` tables (same intent as `drizzle.config`'s `tablesFilter`). A column **rename or drop** is ambiguous and drizzle-kit's resolver still needs a terminal — `cms:push` detects this and prints guidance: DROP the affected table first (data loss, fine for a dev DB you're repopulating) and re-run, or hand-write a migration. For Cloudflare D1, keep using `drizzle-kit push` / wrangler.

During normal feature work you rarely run this by hand: `pnpm dev` already pushes on boot and re-pushes whenever `cms.config.ts` changes. `cms:push` is for when the dev server is **not** running. Two caveats when migrating:

- **Stop the dev server first.** It holds the same `data/cms.db`; running `cms:push` or an import script alongside it can throw `SQLITE_BUSY` / "database is locked" (WAL allows concurrent readers, not two writers). Check with `pnpm exec astro dev status` and stop it with `pnpm exec astro dev stop` before running `cms:push` or an importer.
- **Rename/drop is special.** The dev-start `drizzle-kit push --force` resolves an ambiguous rename as drop+add (data loss) when it has a TTY; `cms:push` can't resolve it headlessly and errors with guidance. Either DROP the affected table first (fine for a dev DB you're repopulating) and re-run, or — to preserve data across a rename/restructure — hand-write a migration (`pnpm db:generate` then edit the SQL).

**2. Bootstrap a standalone script.** Use the helper instead of wiring the runtime by hand:

```ts
// scripts/import.ts  →  node --import tsx scripts/import.ts
import { createCmsContext } from "@/cms/internals/context";

const { cms, assets, reindex, flush, dispose } = await createCmsContext();
// … import work …
await reindex(); // build search once, at the end
await dispose(); // flush fire-and-forget tasks, then close the DB
```

**3. Bulk writes.** Pass a context flag to writes:

- `{ _system: true }` — bypass access rules (server-side / migration ops).
- `{ _skipSearch: true }` — skip the per-document search (re)indexing `create`/`deleteMany` would queue; call `reindex()` once afterwards. Always `await flush()` / `dispose()` before exit so queued search/audit tasks drain (don't `setTimeout`).
- `createMany(items, ctx)` exists but runs documents sequentially (full per-doc path).

**4. Wipe before re-import (idempotent).** `cms.<collection>.deleteMany(filter?, ctx)` removes all matching documents plus their translation/version/search rows; an empty filter clears the whole collection. It skips per-document `beforeDelete`/`afterDelete` hooks and webhooks unless the collection defines delete hooks (then it falls back to the per-doc path). Combine with caller-supplied deterministic `_id`s (`create({ _id, ... })`) so re-runs replace rather than duplicate.

**5. Slugs.** `fields.slug` defaults to `unique: true`. Imported hierarchical or bilingual content often **reuses slugs** across parents/locales — set `fields.slug({ unique: false })` on those collections (uniqueness is global, not scoped by parent/locale).

**6. Body content (`content` field).** A `content` value is `{ type: "root", children: [...] }` whose children interleave rich-text prose with inline component blocks `{ type: "block", blockType, fields }` (the stored discriminator is `"block"`, not the editor's `cmsBlock`). Build prose from HTML with `htmlToRichText(html)` (handles paragraph / heading / list / quote, and emits `{ type: "image", src, alt }` for `<img>`). The field stores any root document as-is — there is **no per-block validation** against the declared `blocks`, so the importer fully controls block shapes; declare the same block types on `fields.content({ blocks })` for the admin editor. Unknown block types render a placeholder in dev / nothing in prod (the renderers don't throw), so partially-migrated content never 500s.

**7. Images / assets.** Image fields store the asset **storagePath string** (`/uploads/<id>.<ext>`). Upload originals with `assets.upload(new File([bytes], filename, { type: mime }), { alt })` and store the returned `storagePath`. `assets.upload` is **not** deduplicated — keep an external `sourceId → storagePath` map (e.g. under `/tmp`) so re-runs don't re-upload and so inline `<img>` `src` can be remapped to local assets.

**8. Translations.** The base-locale row holds the canonical fields; add other locales with `cms.<collection>.upsertTranslation(id, locale, translatableFields)` (only `translatable: true` fields are stored per locale). Declare locales in `cms.config.ts` (`locales.default` + `locales.supported`).

## Stack

Astro 7, React 19, Drizzle ORM (SQLite dev), Zod, Tiptap, shadcn/ui, Tailwind CSS v4, PBKDF2 auth, nanoid, Sharp (image optimization), pnpm, Node >=22.12.0

## Field Types

All fields share base options: `label`, `description`, `required`, `defaultValue`, `indexed`, `unique`, `translatable`, `condition`, `admin`, `access`.

| Field      | Type-specific options                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`     | `maxLength?: number`                                                                                                                                                                                                                           |
| `slug`     | `from?: string` — field to auto-generate slug from                                                                                                                                                                                             |
| `email`    | _(base only)_                                                                                                                                                                                                                                  |
| `number`   | _(base only)_                                                                                                                                                                                                                                  |
| `boolean`  | _(base only)_                                                                                                                                                                                                                                  |
| `date`     | _(base only)_                                                                                                                                                                                                                                  |
| `select`   | `options: string[]` **(required)**                                                                                                                                                                                                             |
| `richText` | _(base only)_ — stored as JSON AST `{ type: "root", children: RichTextNode[] }`                                                                                                                                                                |
| `content`  | `blocks: Record<string, Record<string, FieldConfig>>` **(required)**, `fullscreen?: boolean` — rich text with inline component blocks; stored as JSON AST whose children may include `block` nodes                                             |
| `image`    | _(base only)_ — stores asset reference                                                                                                                                                                                                         |
| `relation` | `collection: string` **(required)**, `hasMany?: boolean`                                                                                                                                                                                       |
| `array`    | `of: FieldConfig` **(required)** — field config for each item                                                                                                                                                                                  |
| `json`     | `schema?: string`; `itemFields?: Record<string, FieldConfig>` — with `admin.component: "repeater"`, renders a typed repeater (array of objects) whose rows use these named sub-fields (text/select/boolean/image/richText) instead of raw JSON |
| `blocks`   | `types: Record<string, Record<string, FieldConfig>>` **(required)**                                                                                                                                                                            |

`admin` sub-options: `component`, `placeholder`, `position` (`"content"` \| `"sidebar"`), `rows`, `help`, `hidden`.

`condition`: `{ field: string; value: string | string[] | boolean }` — show/hide field based on another field's value.

`access`: `{ read?, update? }` — functions receiving `{ user, doc, operation, collection }`, return `boolean`.

## Virtual Modules

Routes in `src/cms/routes/` import app-specific code via `virtual:kide/*` aliases (resolved by the integration). Never import user files by path from core routes — use these modules.

| Module                        | Resolves to                          | Exports                                            |
| ----------------------------- | ------------------------------------ | -------------------------------------------------- |
| `virtual:kide/config`         | `src/cms/cms.config`                 | Default `CMSConfig`                                |
| `virtual:kide/api`            | `src/cms/.generated/api`             | `{ cms }` — typed local API                        |
| `virtual:kide/schema`         | `src/cms/.generated/schema`          | `{ cmsTables }` — Drizzle table map                |
| `virtual:kide/runtime`        | `src/cms/internals/runtime`          | Session, auth, assets, AI, locks, `createCms`      |
| `virtual:kide/db`             | `src/cms/adapters/db`                | `{ getDb }` — Drizzle instance                     |
| `virtual:kide/email`          | `src/cms/adapters/email`             | `{ sendInviteEmail, isEmailConfigured }`           |
| `virtual:kide/block-renderer` | `src/components/BlockRenderer.astro` | Default Astro component                            |
| `virtual:kide/admin-css`      | Generated `.kide/admin.css`          | Side-effect import (styles)                        |
| `virtual:kide/custom-fields`  | Generated `.kide/custom-fields.ts`   | `{ customFields }` — custom admin field components |

## Live Preview Protocol

BroadcastChannel `"cms-preview"` connects admin form → preview tab. The client script (`src/cms/client/preview.ts`) is auto-injected by the integration on every page; activates only when `?preview` is in the URL.

**Message shapes (admin → preview):**

| Sender                         | Shape                                  | Preview behavior                                      |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `UnsavedGuard` (form inputs)   | `{ field, value }`                     | Sets `textContent` on `[data-cms="{field}"]` elements |
| `RichTextEditor`               | `{ field, value, render: "richText" }` | POSTs to `/api/cms/preview/render`, sets `innerHTML`  |
| `BlockEditor`                  | `{ field, value, render: "blocks" }`   | POSTs to `/api/cms/preview/render`, sets `innerHTML`  |
| `[...path].astro` (after save) | `{ type: "reload" }`                   | `location.reload()`                                   |

Public pages opt into preview by adding `data-cms="{fieldName}"` attributes to elements. The render endpoint is dev-only (uses Astro Container API).
