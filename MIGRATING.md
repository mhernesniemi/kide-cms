# Migrating content into Kide

The detailed playbook referenced by `AGENTS.md`. Read this file directly — it's
plain Markdown, no tooling required. (It also ships as the `/migrate` skill in
environments that load project skills, but you don't need that.)

Goal: a fresh import where the admin is correct on the first real run — proper
field controls (no raw JSON), resolved images/relations, working locales and
search.

## Principle: model-first

The agent's only hard job is **map source → Kide value shapes**. Everything else
is stable and documented. Design the target, generate the manifest, validate,
then load. Never reshape the CMS to match a blob you parsed.

## Procedure

### 1. Scout the source

Identify content types, fields, relations, locales, media, and statuses. Decide
what's in scope (e.g. published only; exclude personal data for GDPR). Don't read
the whole source DB — sample enough to learn the shapes.

### 2. Design + declare the target collections

For each source type, pick the Kide field that gives the right **admin control**
(read the field-type table in `MODEL.md`):

- short/long text → `fields.text({ admin: { rows } })`; one-of → `fields.select({ options })`
- colour → `fields.color()`; link → `fields.link()`; media → `fields.image()`
- relations: single → `fields.relation({ collection })`; **multi-pick → `fields.relation({ collection, hasMany: true })`**
- main body with mixed prose + components → `fields.content({ blocks: { … } })` (inline component blocks)
- repeating rows of typed fields → `fields.json({ admin: { component: "repeater" }, itemFields: { … } })`
  (extra keys on a row, e.g. a source id, survive editor round-trips)
- hierarchical/per-locale reused slugs → `fields.slug({ unique: false })`
- colours: `fields.color()` is palette-only — declare `admin.colors` in `cms.config.ts` and
  snap source values onto it (an off-palette value shows as "Custom", not as a blank)
- locales: declare them in `cms.config.ts` (`locales.default` = the site's primary language,
  which is often not English) **and mark every translated field `translatable: true`** —
  only those fields get a translation table; anything else passed as a translation is dropped

### 3. Sync schema + regenerate the manifest

```bash
pnpm cms:generate && pnpm cms:push        # renames/drops: RECREATE=slug1,slug2 pnpm cms:push --allow-data-loss
pnpm cms:describe                         # refresh .kide/model.json + MODEL.md, then re-read it
```

(Stop the dev server first — it holds the SQLite file.)

### 4. Write the importer (run with `node --import tsx`)

Keep source-parsing separate from loading:

- **extract** the source into clean JSON (a sidecar, e.g. `/tmp/export/*.json`).
- **media**: upload referenced originals with `assets.upload(file, { alt, dedupe: true })`.
- **import**: build documents that match `MODEL.md` value shapes and `load()` them.

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
if (dry.warnings.length) console.log(JSON.stringify(dry.warnings, null, 2)); // block/repeater shape mismatches land here
if (dry.failed) {
  console.log(JSON.stringify(dry.invalid, null, 2));
  process.exit(1);
}

// A real run throws ImportFailedError if any document fails to write (the error
// carries the full report), so a half-applied import can never look like success.
await load(items);
await reindex();
await dispose();
```

### 5. Verify

`dryRun` clean → real import → `pnpm cms:reindex` → open `/admin`: proper controls
everywhere, images/relations resolve, locale switcher and search work. Then
`pnpm check` + `pnpm test`.

## Recipe: WordPress + ACF

The hard, source-specific parts (capture once, reuse):

- **Read the dump, not a live DB.** Stream the gzipped `mysqldump`; you only need
  `wp_posts`, `wp_postmeta`, `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships`.
  Editorial post types: `page, post, case, service, career, event, office`.
- **ACF custom fields are flattened key/value meta** in `wp_postmeta`; repeaters are
  indexed keys like `add_service_0_service`, with a count at `add_service`.
  Reconstruct rows from the count + indices.
- **Body is Gutenberg HTML.** It interleaves core blocks (`<!-- wp:heading -->…`) with
  self-closing ACF blocks (`<!-- wp:acf/<name> {"data":{…}} /-->`). Walk it in order:
  core prose → `htmlToRichText(html)` (emits paragraph/heading/list/quote/image nodes);
  each ACF block → an inline `{ type:'block', blockType, fields }`. Preserve
  `wp:html`/`wp:embed`/`wp:table` as an `embed` block so nothing is dropped.
- **Map ACF block fields to your declared block shapes**: relation repeaters → id arrays
  (`hasMany`), ACF link objects → `fields.link()` value `{ url, label, newTab }`, image
  ids → uploaded `storagePath`. A per-block transform keeps this readable.
- **Polylang locales:** `taxonomy=language` gives each post's locale; `taxonomy=post_translations`
  groups translations. Collapse a group into one base doc in `locales.default` + a
  `translations` overlay per other locale. A post that only exists in one language becomes
  a base doc with no overlay — pick the default locale so that is the common case.
- **Categories:** build a `taxonomies` doc (`slug: "categories"`,
  `terms: [{ id, name, slug, children: [] }]` — `children` on every term, nest WP parents there)
  and set each post's `category` to the term slug, so the admin `taxonomy-select` is populated.
  Menus are the same tree shape: `items: [{ id, label, href, children: [] }]`.
- **GDPR:** skip `wp_users`/employees/personal data and author links unless explicitly cleared.
- **Published-only** (if requested): keep `post_status` in `{publish, private}`, set all
  imported docs `_status: "published"`.

> If a prior WordPress→Kide importer exists in the workspace (e.g. `scripts/wp-extract.py`,
> `wp-content.ts`, `wp-media.ts`, `wp-import.ts`), reuse it rather than re-deriving the
> Gutenberg/ACF parsing.

## Pitfalls (all real, all first-try killers)

- Forgetting `cms:describe` and guessing field shapes → blocks render as JSON. Read `MODEL.md`.
- `cms:push` stalling on a rename → `RECREATE=slug pnpm cms:push --allow-data-loss`.
- `translations` for a collection with no `translatable: true` fields → `dryRun` reports it;
  without the flag every base doc would be written and every translation refused.
- Trusting a clean `dryRun` while ignoring `warnings` → block/repeater keys that don't match
  the declared shape are warnings, not errors, and render as raw JSON in the editor.
- Indexing per-doc during bulk → `_skipSearch` + one `reindex()`.
- Re-running media without `dedupe: true` → duplicate assets.
- Skipping `dryRun` → discovering shape mismatches in the admin instead of a report.
