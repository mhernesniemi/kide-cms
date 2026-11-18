# Migrating content into Kide

The playbook referenced by `AGENTS.md`. Plain Markdown, no tooling required (it
also ships as the `/migrate` skill).

Goal: an import where the admin is correct on the first real run (proper field
controls, resolved images/relations, working locales and search) and where you can
**prove** nothing was silently lost.

## WordPress: the `kide import` pipeline

For WordPress, don't write an importer script. You write **mappings** (source →
Kide as plain functions) and the pipeline does the rest: parsing, staging,
coverage accounting, validation, media, incremental writes and reconciliation.

```bash
pnpm exec kide import scout <dump.sql[.gz]> --uploads <wp-content/uploads>   # stage the source, write .kide/import/profile.md
pnpm exec kide import sample <type> [--id N]                                 # see real staged records
pnpm exec kide import plan                                                   # run mappings → .kide/import/ledger.md (exit 1 = blocked)
pnpm exec kide import apply                                                  # write changed docs only, upload media, prune stale docs
pnpm exec kide import verify                                                 # read everything back, reconcile with the plan
pnpm exec kide import check-live                                             # compare with the rendered live site → live.md
```

The loop is **scout → model (Kide-native) → map → plan until READY → apply → verify →
check-live**. Everything the agent needs to read is in `.kide/import/`: `profile.md`
(what exists), `ledger.md` (what's still unaccounted, with samples), `verify.md` (what
didn't land), `live.md` (what the live site shows that Kide doesn't).

### 1. Scout

`scout` streams a `mysqldump` (plain or `.gz`, any table prefix) into
`.kide/import/staging.db` and writes `profile.md`: every source type with record
counts, statuses and locales, and every **path** with its fill rate and a sample.
Never read the dump yourself; use `profile.md` and `sample`.

The adapter already handles the WordPress mechanics:

- revisions, auto-drafts, trash, ACF/theme internals and editor bookkeeping meta are left out
- **ACF** repeaters and flexible content come back nested (`meta.facts[].label`,
  `layout[].acf_fc_layout`); serialized PHP values are unserialized
- **Polylang / WPML**: each record carries `locale` and a translation `group`
- attachments become media (`featuredImage` is the attachment id)
- terms are their own source types (`term:category`), and posts carry `terms.<taxonomy>`;
  one `taxonomy` record per taxonomy and locale lets a whole term tree map to one document
- `permalink` on every record is the URL WordPress serves (from Yoast indexables);
  `frontPage: true` marks the front page and its translations
- nav menus carry their theme `location`; Polylang's per-language menus for one location
  form a translation group
- Gravity Forms definitions are `form` records (entries are never staged: personal data);
  Redirection plugin rules are `redirect` records

`--uploads` points at a local copy of `wp-content/uploads` (fastest, and the plan can
check that files exist). Without it, media is downloaded from the site URL on apply
(`--media-base <url>` to override the base, e.g. Bedrock's `/app/uploads`).
`--site-url <url>` overrides a stale `home` option (Bedrock sets it from the environment).

### 2. Model the target the Kide way

Map every source concept to Kide's native construct first; a generic collection is the
last resort. Read the Kide docs for the pattern (menus, taxonomies, forms, shared
sections) and `MODEL.md` (`pnpm cms:describe`) for field controls and value shapes.

| WordPress                           | Kide                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| page, post, custom post type        | a collection with `drafts`, `slug`, `pathPrefix` (per locale: `{ en: "blogs", fi: "blogit" }`) so routes keep the WordPress URLs |
| front page                          | slug `home` (routes to `/`, `/fi`)                                                                                               |
| categories, tags, custom taxonomies | one `taxonomies` document per taxonomy (`taxonomy-terms`, translatable), assigned with `fields.taxonomy({ taxonomy, hasMany })`  |
| nav menus (per location)            | a `menus` document per location, `menu-items` translatable                                                                       |
| Gravity Forms                       | `forms` + `form-submissions` (the forms pattern); content blocks reference a form by relation                                    |
| reusable blocks                     | `shared-sections` when they're reused; the importer inlines unused ones                                                          |
| ACF blocks                          | inline `content` blocks; colour toggles become a boolean plus `condition`al `fields.color()`                                     |
| ACF link / internal URLs            | `fields.link()`; the importer stores internal targets as references (`docId` + `collection`)                                     |
| ACF repeater                        | typed repeater (`json` + `itemFields`)                                                                                           |
| Redirection plugin                  | a `redirects` collection (the site's middleware serves it)                                                                       |
| Polylang / WPML                     | locales in `cms.config.ts`, `translatable: true` on every field with per-locale values                                           |

**Before writing mappings, present the model and the scope decisions to the user**
(published only? personal data such as employees and authors? menus? forms?) and get
them confirmed. Then `pnpm cms:generate && pnpm cms:push` (stop the dev server first).

### 3. Map

One file per source type in `migration/<type>.map.ts`:

```ts
import { defineMapping } from "@kidecms/core/importer";

export default defineMapping({
  source: "post",
  collection: "posts",
  filter: (src) => ["publish", "private"].includes(src.status) || "not published",
  map: (src, ctx) => ({
    title: src.title,
    slug: src.slug,
    publishedAt: ctx.date(src.date),
    image: ctx.media(src.featuredImage),
    related: ctx.refs(src.meta.related_posts),
    facts: (src.meta.facts ?? []).map((f: any) => ({ label: f.label, value: f.value })),
    body: ctx.content(src.content),
  }),
  blocks: {
    "acf/hero": (b, ctx) => ({
      type: "block",
      blockType: "hero",
      fields: { heading: b.data.heading, image: ctx.media(b.data.image), cta: ctx.link(b.data.cta) },
    }),
  },
  drop: {
    author: "personal data (GDPR)",
    "meta._yoast_*": "SEO migrated separately",
    "block:core/spacer": "layout only",
  },
});
```

Use `skipSource("nav_menu_item", "menus rebuilt by hand")` (also from
`@kidecms/core/importer`) for a whole type you're leaving out.

**How coverage works:** the engine runs `map` on proxied records and records every
field it reads. Every non-empty path in the source must be **read** by the mapping or
listed in **`drop` with a reason**. That covers fields, Gutenberg blocks
(`block:<name>`), ACF block fields (`block:acf/x.data.<field>`) and shortcodes
(`shortcode:<name>`). Anything else is **unaccounted** and blocks the plan, so a
forgotten field can't slip through. `drop` keys take globs and prefixes (`meta.legacy`
drops everything under it).

`ctx` helpers:

| helper                                           | does                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.content(html)`                              | Gutenberg/classic HTML → `content` value. Core text blocks, lists, images, galleries, buttons and files convert automatically, as do groups/columns (recursed) and reusable blocks (inlined). Other blocks go to your `blocks` handlers (return content nodes, or an HTML string). Uploads images/file links become media, internal links become root-relative. |
| `ctx.richText(html)` / `ctx.text(html)`          | HTML (e.g. ACF wysiwyg) → rich text / plain text                                                                                                                                                                                                                                                                                                                |
| `ctx.media(idOrUrl)`                             | attachment id, ACF image or uploads URL → image value (resized `-300x200` URLs resolve to the original)                                                                                                                                                                                                                                                         |
| `ctx.ref(id)` / `ctx.refs(ids)` / `ctx.term(id)` | source post/term id → Kide `_id` (translations resolve to their group's document)                                                                                                                                                                                                                                                                               |
| `ctx.link(v)`                                    | ACF link array or URL → link field value; a URL of an imported document becomes a reference (`docId`, `collection`)                                                                                                                                                                                                                                             |
| `ctx.refLink(id)`                                | source post id → reference link value                                                                                                                                                                                                                                                                                                                           |
| `ctx.records(type)`                              | records of a type in the mapping's `includes` (menu items into menus, terms into a taxonomy); their paths join this mapping's coverage as `<type>:<path>`                                                                                                                                                                                                       |
| `ctx.translation(key, locale)`                   | the `locale` member of a record's translation group (e.g. a post tagged with another language's term)                                                                                                                                                                                                                                                           |
| `ctx.date(v)`                                    | WP / ACF (`20230501`) date → ISO                                                                                                                                                                                                                                                                                                                                |
| `ctx.record(id)`                                 | look up another staged record (untracked)                                                                                                                                                                                                                                                                                                                       |

Shortcodes: `shortcodes: { name: (attrs, inner) => html }`, or `"keep"` to leave one as
literal text (code samples in technical posts); `"*"` sets the rule for every other
shortcode. `[caption]` and `[embed]` are handled by default.

URL changes: a mapping with `source: "url-change"` runs after the others and gets one
record (`from`, `to`) per URL the new routes change, e.g. to write 301s into `redirects`.

Defaults you don't write: `_id` is `wp-<id>` (`wp-term-<id>` for terms) unless you pass
`id`; `_status` is `published` for publish/private and `draft` otherwise; a
translation group becomes one document (default-locale member as base,
`_sourceLocale` set) plus an overlay per other locale with its translatable fields.

Source types are independent, so mappings can be written **in parallel** (one agent per
type). `pnpm exec kide import plan --only post` checks one type without saving the plan.
`--show <wp id>` prints the planned document for one record.

### 4. Plan until READY

`plan` validates every document against the model and blocks on:

- **unaccounted** paths, or source types with no mapping or `skipSource`
- **invalid / shape**: wrong value shapes, undeclared block or repeater keys (these render as raw JSON in the admin)
- **dangling-ref**: a ref to a post that isn't imported (map it, or `ctx.ref(id, { optional: true })`)
- **dangling-term**: a taxonomy value that isn't a term of its taxonomy in that locale
- **bundled-term**: a term name that holds several terms (`Business|Press releases`)
- **missing-media**: an attachment or file that isn't in the source/uploads dir
- **low-recall**: less than 95% (`--min-recall`) of the text the mapping read reaches the document
- **duplicate-id**

Make a field `translatable` only when editors set it per language: text, yes; colours,
images, dates and relations usually not. Polylang/WPML keep a full copy of every field per
language, so some values differ by accident. The plan counts how many translations differ
per field and says so once per field:

- `lost-translation`: a shared field differs in some translations; the original's value is
  kept. For text, make it translatable. For settings, a few differences are noise; many
  may be intended.
- `translation-advice`: a translatable setting rarely differs; it is probably shared.

Translation values equal to the original aren't stored; they inherit, so they can't go
stale (slugs stay explicit). `url-change` notices list every document whose
Kide route differs from its WordPress URL (nested pages, non-ASCII slugs); redirect them
with a `url-change` mapping. Fix, re-run, repeat. It takes a second even on large sites,
since nothing is written.

### 5. Apply + verify

`apply` refuses a blocked plan (`--force` overrides). It writes only documents whose
content changed since the last apply (`--all` rewrites everything), uploads media once
(parallel, content-hash deduped, remembered across runs), republishes updated
published documents, deletes documents it created earlier that the plan no longer
contains (`--no-prune` to keep them), and rebuilds search once.

`verify` reads every document back as editors see it and as the site serves it,
then checks it against the plan: it must be present, every planned field filled, media
resolved, translations stored, the text recall still met, and its route equal to the
WordPress URL (or the announced URL change).

`check-live` fetches every published document's URL from the live site and looks for each
visible content block in the Kide document. Blocks Kide lacks are traced in the dump: in
the page's own record → **missing** (a real loss); in another record that isn't migrated →
**skipped source** (e.g. employee cards); nowhere → **drift** (the live page changed after
the export). Pages are cached in `.kide/import/live/`; `--refresh` refetches. Then open
`/admin` for a visual pass, and run `pnpm check && pnpm test`.

Re-running is cheap: scout a fresh dump before cutover and plan → apply → verify again.
Only the delta is written.

Paths can be redirected for throwaway runs: `KIDE_IMPORT_DIR`, `KIDE_IMPORT_MAPPINGS`,
`CMS_DATABASE_URL`, `CMS_UPLOADS_DIR`.

## Other sources: the `load()` toolkit

For non-WordPress sources, write an importer with `createCmsContext()` and validate
with `load(items, { dryRun: true })` before writing:

```ts
import { createCmsContext } from "@kidecms/core/context";
const { load, reindex, dispose } = await createCmsContext();

const items = source.map((row) => ({
  collection: "posts",
  data: { _id: `src-${row.id}`, title: row.title, body: buildContent(row), _status: "published" },
  translations: row.fi ? { fi: { title: row.fi.title } } : undefined,
}));

const dry = await load(items, { dryRun: true }); // fix everything it flags, including `warnings`
if (dry.failed || dry.warnings.length) {
  console.log(JSON.stringify({ invalid: dry.invalid, warnings: dry.warnings }, null, 2));
  process.exit(1);
}
await load(items); // throws ImportFailedError if any document fails
await reindex();
await dispose();
```

Build prose with `htmlToRichText(html)`, upload media with
`assets.upload(file, { alt, dedupe: true })`, and wipe target collections first
(`deleteMany({}, { _system: true })`) so deterministic `_id`s replace instead of duplicating.

## Pitfalls

- Guessing field shapes instead of reading `MODEL.md`: blocks render as JSON.
- `cms:push` stalling on a rename: use `RECREATE=slug pnpm cms:push --allow-data-loss`.
- Dropping something to get the plan green: every `drop` needs a real reason, and
  it shows up in the ledger for review.
- Storing single-language content under the default locale: the pipeline sets
  `_sourceLocale` for you; in `load()` scripts, set it yourself.
- GDPR: drop `author` and personal-data fields unless explicitly cleared.
- Bundled terms: old CSV imports often stored several terms as one name
  (`AJAX|Drupal|Jquery`). `plan` blocks on them. Split each with `termParts()` from
  `@kidecms/core/importer`, in the taxonomy tree and in every post reference, and set
  `textMatch: "set"` so the text check counts each distinct word once.
