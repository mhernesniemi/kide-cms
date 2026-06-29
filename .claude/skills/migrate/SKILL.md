---
name: migrate
description: Migrate content from another CMS (WordPress, Payload, Contentful, …) into this Kide project. Use when importing/porting external content, doing a bulk content load, or building an importer. Walks the model-first workflow, the migration toolkit, and a worked WordPress/ACF recipe.
---

# Migrating content into Kide

Goal: a fresh import where the admin is correct on the first real run — proper field controls (no raw JSON), resolved images/relations, working locales and search. Read `AGENTS.md` at the repo root first; this skill is the procedure.

## Principle: model-first

The agent's only hard job is **map source → Kide value shapes**. Everything else is stable and documented. So: design the target, generate the manifest, validate, then load. Never reshape the CMS to match a blob you parsed.

## Procedure

### 1. Scout the source

Identify content types, fields, relations, locales, media, and statuses. Decide what's in scope (e.g. published only; exclude personal data for GDPR). Don't read the whole source DB — sample enough to learn the shapes.

### 2. Design + declare the target collections

For each source type, pick the Kide field that gives the right **admin control** (read the field-type table in `MODEL.md`):

- short/long text → `fields.text({ admin: { rows } })`; one-of → `fields.select({ options })`
- colour → `fields.color()`; link → `fields.link()`; media → `fields.image()`
- relations: single → `fields.relation({ collection })`; **multi-pick → `fields.relation({ collection, hasMany: true })`**
- main body with mixed prose + components → `fields.content({ blocks: { … } })` (inline component blocks)
- repeating rows of typed fields → `fields.json({ admin: { component: "repeater" }, itemFields: { … } })`
- hierarchical/per-locale reused slugs → `fields.slug({ unique: false })`
- declare locales in `cms.config.ts` (`locales.supported`)

### 3. Sync schema + regenerate the manifest

```bash
pnpm cms:generate && pnpm cms:push        # renames/drops: RECREATE=slug1,slug2 pnpm cms:push
pnpm cms:describe                         # refresh .kide/model.json + MODEL.md, then re-read it
```

(Stop the dev server first — it holds the SQLite file.)

### 4. Write the importer (three small scripts, run with `node --import tsx`)

- **extract** the source into clean JSON (a sidecar, e.g. `/tmp/export/*.json`) — keep source-parsing separate from loading.
- **media**: upload referenced originals with `assets.upload(file, { alt, dedupe: true })`, keep an id→storagePath map for the run.
- **import**: build documents that match `MODEL.md` value shapes and `load()` them.

Importer skeleton:

```ts
import { createCmsContext } from "@/cms/internals/context";
const { cms, load, reindex, dispose } = await createCmsContext();
const ctx = { _system: true, _skipSearch: true };

// idempotent: wipe target collections first (deterministic _id → replace, not duplicate)
for (const slug of ["pages", "posts"]) await (cms as any)[slug].deleteMany({}, ctx);

const items = source.map((row) => ({
  collection: "posts",
  data: { _id: `wp-${row.id}`, title: row.title, slug: row.slug, body: buildContent(row), _status: "published" },
  translations: row.fi ? { fi: { title: row.fi.title, body: buildContent(row.fi) } } : undefined,
}));

const dry = await load(items, { dryRun: true }); // FIX everything it flags before the real run
if (dry.failed) {
  console.log(JSON.stringify(dry.invalid, null, 2));
  process.exit(1);
}

await load(items);
await reindex();
await dispose();
```

### 5. Verify

`dryRun` clean → real import → `pnpm cms:reindex` → open `/admin`: proper controls everywhere, images/relations resolve, locale switcher and search work. Then `pnpm check` + `pnpm test`.

## Recipe: WordPress + ACF

The hard, source-specific parts (capture once, reuse):

- **Read the dump, not a live DB.** Stream the gzipped `mysqldump`; you only need `wp_posts`, `wp_postmeta`, `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships`. Editorial post types: `page, post, case, service, career, event, office`.
- **ACF custom fields are flattened key/value meta** in `wp_postmeta`; repeaters are indexed keys like `add_service_0_service`, with a count at `add_service`. Reconstruct rows from the count + indices.
- **Body is Gutenberg HTML.** It interleaves core blocks (`<!-- wp:heading -->…`) with self-closing ACF blocks (`<!-- wp:acf/<name> {"data":{…}} /-->`). Walk it in order: core prose → `htmlToRichText(html)` (it emits paragraph/heading/list/quote/image nodes); each ACF block → an inline `{ type:'block', blockType, fields }`. Preserve `wp:html`/`wp:embed`/`wp:table` as an `embed` block so nothing is dropped.
- **Map ACF block fields to your declared block shapes**: relation repeaters → id arrays (`hasMany`), ACF link objects → `fields.link()` value `{ url, label, newTab }`, image ids → uploaded `storagePath`. A per-block transform keeps this readable.
- **Polylang locales:** `taxonomy=language` gives each post's locale; `taxonomy=post_translations` groups translations. Collapse a group into one base (en) doc + `upsertTranslation(fi, …)`.
- **Categories:** build a `taxonomies` doc (`slug: "categories"`, `terms: [{id,name,slug}]`) and set each post's `category` to the term slug, so the admin `taxonomy-select` is populated.
- **GDPR:** skip `wp_users`/employees/personal data and author links unless explicitly cleared.
- **Published-only** (if requested): keep `post_status` in `{publish, private}`, set all imported docs `_status: "published"`.

> If a prior WordPress→Kide importer exists in the workspace (e.g. `scripts/wp-extract.py`, `wp-content.ts`, `wp-media.ts`, `wp-import.ts`), reuse it rather than re-deriving the Gutenberg/ACF parsing.

## Pitfalls (all real, all first-try killers)

- Forgetting `cms:describe` and guessing field shapes → blocks render as JSON. Read `MODEL.md`.
- `cms:push` stalling on a rename → use `RECREATE=`.
- Indexing per-doc during bulk → `_skipSearch` + one `reindex()`.
- Re-running media without `dedupe: true` → duplicate assets.
- Skipping `dryRun` → discovering shape mismatches in the admin instead of a report.
