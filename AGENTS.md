# AGENTS.md — migrating content into Kide

Kide is a code-first CMS inside Astro (collections in `src/cms/collections/`, local SQLite in dev). If you're an agent **importing content from another CMS** (WordPress, Payload, Contentful, …), read this first — it removes the guesswork that makes migrations fail on the first try.

## The contract: don't reverse-engineer the codebase

1. **Generate the model manifest, then read it.**

   ```bash
   pnpm cms:describe      # writes .kide/model.json + MODEL.md
   ```

   `MODEL.md` is the authoritative map of every collection, every field, **its admin control, and the exact value shape you must write**. Read it instead of spelunking `src/cms/`. Re-run `cms:describe` after editing collections.

2. **Design the target first, then map the source to it.** Decide what control each field should present in the admin (see the field-type table in `MODEL.md`), declare the collections/blocks for that, regenerate the manifest, and only then write the importer. Don't reshape the CMS to match a JSON blob you parsed.

3. **Validate before writing.** Use the migration toolkit's dry-run so shape mismatches show up in a report, not by opening the admin and finding raw JSON.

## Golden path

```bash
pnpm cms:generate && pnpm cms:push     # sync schema (use --recreate=slug for renames/drops)
node --import tsx scripts/your-import.ts   # see the skill /migrate for the script shape
pnpm cms:reindex                       # build search (or context.reindex())
```

A migration script bootstraps with `createCmsContext()` and uses `load()` (validate + create) — see `.claude/skills/migrate/SKILL.md`:

```ts
import { createCmsContext } from "@/cms/internals/context";
const { cms, assets, load, reindex, dispose } = await createCmsContext();

// dry run first — fix everything it flags before importing for real
const report = await load(items, { dryRun: true });
if (report.failed) {
  console.log(report.invalid);
  process.exit(1);
}

await load(items); // { _system:true, _skipSearch:true } by default
await reindex();
await dispose();
```

## Invariants & gotchas (these are what bite first-try)

- **Schema sync is `cms:push`** (non-interactive). A column **rename/drop** can't be auto-resolved headlessly → run `RECREATE=pages,posts pnpm cms:push` (drops + recreates those tables; data loss, fine for a DB you're repopulating). The dev server also auto-pushes on boot — stop it before running scripts (SQLite single-writer).
- **Bulk writes:** pass `{ _system: true, _skipSearch: true }` (the default in `load()`), then `reindex()` once. Don't index per document.
- **Wipe before re-import:** `cms.<collection>.deleteMany({}, { _system: true })`. Combine with caller-supplied `_id`s so re-runs replace, not duplicate.
- **Slugs default `unique: true`** — set `fields.slug({ unique: false })` for hierarchical or per-locale reused slugs.
- **Field controls matter.** Use the right field so the admin shows a real control, not JSON: `fields.relation({ hasMany: true })` (multi-pick), `fields.color()` (swatch picker), `fields.link()` (URL+label), `fields.image()` (asset picker), and for object lists `fields.json({ admin: { component: "repeater" }, itemFields: { … } })` (typed repeater rows). See `MODEL.md` for the full table.
- **`content` field** stores any `{ type:'root', children:[…] }` doc as-is; inline block `fields` are **not** validated, so you control their shape — but declare `blocks` so the editor renders them. Build prose with `htmlToRichText(html)`; the stored inline-block discriminator is `type:'block'`.
- **Images:** `assets.upload(file, { alt, dedupe: true })` returns `{ storagePath }`; store that string in image fields. `dedupe` makes re-runs idempotent (content-hash), no external map needed.
- **Translations:** base-locale row + `cms.<col>.upsertTranslation(id, locale, translatableFields)`. Declare locales in `cms.config.ts`.
- **Published vs draft is the importer's call** — filter the source if you only want published content.

## Validation checklist (definition of done)

`pnpm cms:describe` current · importer ran with `dryRun` clean · `pnpm check` (zero new errors outside `adapters/cloudflare/`) · `pnpm test` · open `/admin`: every field shows a proper control (no raw JSON), images/relations resolve, locale switcher works, search returns results.
