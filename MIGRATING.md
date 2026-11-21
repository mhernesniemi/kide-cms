# Migrating content into Kide

The playbook referenced by `AGENTS.md`. Plain Markdown, no tooling required (it
also ships as the `/migrate` skill).

Goal: an import where the admin is correct on the first real run (proper field
controls, resolved images/relations, working locales and search) and where you can
**prove** nothing was silently lost.

## WordPress: the `kide import` pipeline

For WordPress, don't write an importer script. You write **mappings** (source →
Kide as plain functions) and the pipeline does the rest: parsing (with WordPress's own
block, shortcode and autop code), staging, coverage accounting, validation, media,
incremental writes and reconciliation. It's the `@kidecms/wordpress` plugin:
`pnpm add -D @kidecms/wordpress` adds the `kide import` command and the mapping API.

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

- revisions, auto-drafts, trash, ACF/theme internals and editor bookkeeping meta (Yoast
  scores, menu-item post columns) are left out; media-modal and REST snapshots that editors
  embed in block attributes count only by their `id`
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
check that files exist). Without it, media is downloaded from the site URL on apply, once:
downloads are cached in `~/.cache/kide/import-media` (`KIDE_MEDIA_CACHE` to move it), so fresh
projects and `apply --all` re-runs don't fetch them again.
Bedrock (`siteurl` ending in `/wp`) is detected: the site root drops `/wp` and uploads
come from `/app/uploads`. `--site-url` and `--media-base <url>` override both.

### 2. Model the target the Kide way

Map every source concept to Kide's native construct first; a generic collection is the
last resort. `MODEL.md` (`pnpm cms:describe`) lists field controls and value shapes.
The site-wide structures come ready-made from `@kidecms/core`, so don't write them:

```ts
import { defineConfig, presets, standardBlocks } from "@kidecms/core";
// collections: [...yours, presets.menus, presets.taxonomies, presets.forms, presets.formSubmissions, presets.redirects]
// content fields: fields.content({ blocks: { ...standardBlocks({ forms: true }), hero: { … } } })
```

| WordPress                                                                                     | Kide                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| page, post, custom post type                                                                  | a collection with `drafts`, `slug`, `pathPrefix` (per locale: `{ en: "blogs", fi: "blogit" }`) so routes keep the WordPress URLs                                                                             |
| front page                                                                                    | slug `home` (routes to `/`, `/fi`)                                                                                                                                                                           |
| category used as a section                                                                    | its own collection when its posts have their own URL prefix (`/news/…`): several mappings share `source: "post"`, split by `filter`                                                                          |
| categories, tags, custom taxonomies                                                           | `presets.taxonomies`: one document per taxonomy, built with `ctx.termTree(src)`, assigned with `fields.taxonomy({ taxonomy, hasMany })`, whose value is term slugs (`src.terms.post_tag.map((t) => t.slug)`) |
| nav menus (per location)                                                                      | `presets.menus`: one document per location, built with `ctx.menuItems(src)`                                                                                                                                  |
| Gravity Forms                                                                                 | `presets.forms` + `presets.formSubmissions`, built with `ctx.form(src)`; content blocks reference a form by relation                                                                                         |
| core details / table / video / audio / embed / code / html, Gravity Forms block and shortcode | `standardBlocks()` (accordion, table, video, audio, embed, code, html; `form` with `{ forms: true }`): converted automatically once the content field declares them                                          |
| reusable blocks                                                                               | `shared-sections` when they're reused; the importer inlines unused ones                                                                                                                                      |
| ACF blocks                                                                                    | inline `content` blocks; colour toggles become a boolean plus `condition`al `fields.color()`                                                                                                                 |
| ACF link / internal URLs                                                                      | `fields.link()`; the importer stores internal targets as references (`docId` + `collection`)                                                                                                                 |
| ACF repeater                                                                                  | typed repeater (`json` + `itemFields`)                                                                                                                                                                       |
| Redirection plugin                                                                            | `presets.redirects` (the site's middleware serves it)                                                                                                                                                        |
| Polylang / WPML                                                                               | locales in `cms.config.ts`, `translatable: true` on every field with per-locale values                                                                                                                       |

Model cheat sheet (the full list of options is in `@kidecms/core`'s `define.ts` types):

```ts
import { defineCollection, fields, standardBlocks } from "@kidecms/core";

export default defineCollection({
  slug: "news",
  labels: { singular: "News article", plural: "News" },
  pathPrefix: { fi: "ajankohtaista", en: "news" }, // routes: /<locale>/<prefix>/<slug>, no parent nesting
  drafts: true,
  timestamps: true,
  admin: { group: "Content" },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", unique: false, translatable: true, admin: { position: "sidebar" } }),
    image: fields.image(),
    gallery: fields.array({ of: fields.image() }),
    tags: fields.taxonomy({ taxonomy: "tags", hasMany: true }),
    parent: fields.relation({ collection: "pages" }),
    body: fields.content({
      translatable: true,
      // a block is a name → fields map; repeaters are json + itemFields
      blocks: {
        ...standardBlocks({ forms: true }),
        hero: { title: fields.text(), image: fields.image(), cta: fields.link() },
      },
    }),
  },
});
```

Common field options: `required`, `translatable`, `unique`, `defaultValue`, `condition`,
`admin: { position: "sidebar", help, rows, hidden }`; a colour palette is `admin.colors` in
`cms.config.ts`. Routes are flat: a nested WordPress page keeps a `parent` relation, but its
URL changes. The profile counts nested URLs per type, the plan lists each change, every
internal link (rich text, link fields, menus, redirect targets) follows automatically, and a
`url-change` mapping writes redirects for visitors' bookmarks. Redirect conflicts resolve in
the plan: a rule that now points at itself or would hide a document's new route is left out,
and of two rules from one URL the site's own wins over the generated one (each is noted).

An empty translatable field in a translation inherits the original's value (Kide's fallback);
the plan says per field how many translations do, so editors know which ones to fill.

**Before writing mappings, present the model and the scope decisions to the user**
(published only? personal data such as employees and authors? menus? forms?) and get
them confirmed. Then `pnpm cms:generate && pnpm cms:push` (stop the dev server first).

### 3. Map

One file per source type in `migration/<type>.map.ts`. **Map by shape first**: name the Kide
fields after their source and let the importer fill them, then write code only for what differs.

```ts
import { defineMapping } from "@kidecms/wordpress";

export default defineMapping({
  source: "post",
  collection: "posts",
  filter: (src) => ["publish", "private"].includes(src.status) || "not published",
  map: (src, ctx) => ({
    ...ctx.auto(src), // title, slug, body, image, excerpt, publishedAt, parent, terms, Yoast SEO, ACF meta by name
    related: ctx.refs(src.meta.related_posts), // only what auto can't know
  }),
  drop: { author: "personal data (GDPR)" },
});
```

- `ctx.auto(src)` fills every field of the collection by name and declared type: `title`, `slug`
  (`home` for the front page), the first `content` field from the post body, `image` /
  `featuredImage`, `excerpt`, `publishedAt` / `date`, `parent`, taxonomy fields from the
  record's terms (`tags` ← `post_tag`, `categories` ← `category`, else the field or taxonomy
  name), `seoTitle` / `seoDescription` / `ogTitle` / `ogDescription` / `ogImage` / `noindex` / `nofollow` from Yoast (its
  `%%title%% %%sep%%` default patterns aren't content and are left out), and any other field from the ACF meta value of the same name (`subTitle` or
  `sub_title`). Values convert by the field's type: image → media, link → link value,
  richText/content → converted HTML, repeater → typed rows, relation → refs, boolean, number, date.
- **Plugin and ACF blocks map by name too**: `acf/color-text` fills a declared `colorText`
  block from its ACF data, and `exf/link-list` a declared `linkList` from its attributes,
  field by field. Name the block's fields after the source (`heroTitle`, `links[].url`) and
  write a `blocks` handler only where the Kide shape really differs. A core block without a
  built-in conversion (`core/rss` → `rss`, `core/query` → `query`) maps the same way. A block
  that holds child blocks fills an unfilled repeater with one row per child (a carousel's
  cards) and an unfilled `heading`/`title` from its heading child. `fields.image()` holds any
  uploaded file, video included.
- References `auto` can't resolve (a deleted employee, a draft post) are left out with a
  warning instead of blocking; a post id in a link field becomes a reference link; rows that
  end up empty are dropped. Spread `auto` and override any field it gets wrong.
- Whatever auto doesn't consume stays unaccounted in the ledger, and inner content a block
  handler or auto-mapped block leaves out (a paragraph inside a card) fails the text check, so
  nothing is lost silently.

Types for shared handler modules: `import type { BlockHandler, MapContext, SourceRecord } from "@kidecms/wordpress"`.

Use `skipSource("nav_menu_item", "menus rebuilt by hand")` (also from
`@kidecms/wordpress`) for a whole type you're leaving out.

The structures are one-liners:

```ts
defineMapping({
  source: "term:nav_menu",
  collection: "menus",
  includes: ["nav_menu_item"],
  map: (src, ctx) => ({ name: src.name, slug: src.location, items: ctx.menuItems(src) }),
});
defineMapping({
  source: "taxonomy",
  collection: "taxonomies",
  includes: ["term:post_tag"],
  filter: (src) => src.taxonomy === "post_tag" || "categories became collections",
  map: (src, ctx) => ({ name: "Tags", slug: "tags", terms: ctx.termTree(src) }),
});
defineMapping({ source: "form", collection: "forms", id: (src) => `form-${src.id}`, map: (src, ctx) => ctx.form(src) });
```

**Several collections from one source type**: export several mappings with the same
`source` from one file (`export default [newsMapping, casesMapping]`). Check publishing first, then ownership, with every locale's category slug (the profile
lists the terms): `filter: (src) => !["publish", "private"].includes(src.status) ? "not published" : ["ajankohtaista", "news", "nyheter"].includes(src.terms.category?.[0]?.slug)`.
That way drafts of a category no mapping takes are accounted too. Each record goes to the mapping whose `filter` returns `true`; `false` means
"another mapping's record", a reason string means "left out". A record no filter
claims blocks the plan, so nothing falls between them.

**How coverage works:** the engine runs `map` on proxied records and records every
field it reads (only what the code actually reads: in `a ?? b`, `b` counts only where `a`
is empty, so read both first when either may fill the field). Every non-empty path in the source must be **read** by the mapping or
listed in **`drop` with a reason**. That covers fields, Gutenberg blocks
(`block:<name>`), ACF block fields (`block:acf/x.data.<field>`) and shortcodes
(`shortcode:<name>`). Anything else is **unaccounted** and blocks the plan, so a
forgotten field can't slip through. `drop` keys take globs and prefixes; a prefix matches whole path segments (`meta.legacy`
drops everything under it, `block:core/post-*` every `core/post-…` block).

`ctx` helpers:

| helper                                           | does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.content(html)`                              | Gutenberg/classic HTML → `content` value. Core text blocks, lists, images, galleries, buttons, files, covers and shortcode blocks convert automatically, as do groups/columns (recursed), reusable blocks (inlined) and details/table/video/audio/embed/code/html/media-text plus Gravity Forms blocks and `[gravityform]` (to `standardBlocks()` when declared, else to plain content; markup without text, such as a widget, becomes an `html` block or a warning). Other blocks go to your `blocks` handlers (return content nodes, or an HTML string). Uploads images/file links become media, internal links become root-relative. |
| `ctx.richText(html)` / `ctx.text(html)`          | HTML (e.g. ACF wysiwyg) → rich text / plain text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ctx.media(idOrUrl)`                             | attachment id, ACF image or uploads URL → image value (resized `-300x200` URLs resolve to the original); `ctx.media`, `ctx.ref` and `ctx.refLink` take `{ optional: true }` to return null instead of an issue                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ctx.ref(id)` / `ctx.refs(ids)` / `ctx.term(id)` | source post/term id → Kide `_id` (translations resolve to their group's document); a record key addresses any other source (`ctx.ref("form:4")`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ctx.link(v)`                                    | ACF link array or URL → link field value; a URL of an imported document becomes a reference (`docId`, `collection`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ctx.refLink(id)`                                | source post id → reference link value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ctx.records(type)`                              | records of a type in the mapping's `includes` (menu items into menus, terms into a taxonomy); their paths join this mapping's coverage as `<type>:<path>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ctx.translation(key, locale)`                   | the `locale` member of a record's translation group (e.g. a post tagged with another language's term)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ctx.date(v)`                                    | WP / ACF (`20230501`) date → ISO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ctx.record(id)`                                 | look up another staged record (untracked)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ctx.menuItems(menu)` / `ctx.termTree(taxonomy)` | a nav menu term / `taxonomy` record → the `menu-items` / `taxonomy-terms` tree (unimported targets are left out with a warning)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ctx.form(form)`                                 | a Gravity Forms record → a `presets.forms` document (choice values kept, composite fields split per input)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

A block handler, `blocks: { "acme/card": (b, ctx) => … }`, gets `b.attrs`, `b.data` (ACF), `b.innerHTML`, `b.inner()` (its inner
blocks rendered as content), `b.children()` (its inner blocks as raw inputs, each with
`.name`) and `b.auto()` (the same-named declared block's fields filled by name;
`b.auto("storyLiftup")` for one declared under another name), and returns
content nodes, an HTML string, or a block:
`({ type: "block", blockType: "hero", fields: { ...b.auto(), phone: b.attrs.heroCTA?.number } })`.
Field names also match `<name>Id` / `<name>Url` attributes (`image` ← `imageId`).

Shortcodes: `shortcodes: { name: (attrs, inner) => html or content nodes }` (a form
shortcode can return a form block), or `"keep"` to leave one as literal text (code
samples, `[placeholder]` prose); `"*"` sets the rule for every other shortcode.
`[caption]` and `[embed]` are handled by default.

URL changes: internal links (rich text, link fields, menus) to a document whose route
changed are rewritten to the new route automatically. For visitors' bookmarks, a mapping
with `source: "url-change"` runs after the others and gets one record (`from`, `to`) per
changed URL, e.g. `map: (src) => ({ from: src.from, to: src.to, code: "301" })` into
`redirects`. `slugify` (from `@kidecms/core`) and `termParts` / `termSlugs` (from
`@kidecms/wordpress`, for bundled term names) save writing your own. A handler's returned
HTML string is converted like source content (shortcodes run, images become media).

Defaults you don't write: `_id` is `wp-<id>` for posts and `wp-<record key>` for everything
else (`wp-term-5`, `wp-form-4`, `wp-redirect-3`) unless you pass `id`; `_status` is `published` for publish/private and `draft` otherwise; a
translation group becomes one document (the version written first is the base, with
`_sourceLocale` set to its language) plus an overlay per other locale with its translatable fields.

Source types are independent, so mappings can be written **in parallel** (one agent per
type). `pnpm exec kide import plan --only post` checks one type without saving the plan.
`--show <wp id or record key>` (`--show 12`, `--show form:4`) prints the planned document for
one record; `kide import sample <type> --full` shows records without truncation.

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
contains (`--no-prune` to keep them), and rebuilds search once. A file the source itself
answers 4xx for (deleted from uploads, already broken on the live site) is reported and
its references dropped: images go, links keep their text. Other download errors fail
the document so a re-run can retry.

`verify` reads every document back as editors see it and as the site serves it,
then checks it against the plan: it must be present, every planned field filled, media
resolved, translations stored, the text recall still met, and its route equal to the
WordPress URL (or the announced URL change).

`check-live` fetches every published document's URL from the live site and looks for each
visible content block in the Kide document or a document it references (an embedded
form, linked articles). Blocks Kide lacks are traced in the dump: in the page's own record →
**missing** (a real loss); in another record that isn't migrated → **skipped source** (e.g.
employee cards); nowhere → **not in the dump** (plugin, feed or template output, or edits
after the export). Pages are cached in `~/.cache/kide/import-live` (`KIDE_LIVE_CACHE`), shared across runs; `--refresh` refetches. Then open
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
  (`AJAX|Drupal|Jquery`). `plan` blocks on them. Split them with
  `ctx.termTree(src, { split: true })` and, in every post reference,
  `termSlugs(src.terms.category, { split: true })` (from `@kidecms/wordpress`), and set
  `textMatch: "set"` so the text check counts each distinct word once.
- A field added or made translatable needs `pnpm cms:push` before `apply`; `apply`
  refuses while the database schema is behind the config.
