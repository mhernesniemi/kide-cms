---
name: migrate
description: Migrate content from another CMS (WordPress, Payload, Contentful, …) into this Kide project. Use when importing/porting external content, doing a bulk content load, or building an importer.
---

# Migrating content into Kide

Follow **[`MIGRATING.md`](../../../MIGRATING.md)** at the repo root; it's the canonical playbook. The short version:

**WordPress** (mysqldump): use the `kide import` pipeline, not a hand-written importer.

1. `pnpm exec kide import scout <dump.sql.gz> --uploads <wp-content/uploads>` → read `.kide/import/profile.md`; inspect records with `pnpm exec kide import sample <type>`.
2. Model the target the Kide way (taxonomies, menus, forms, localized `pathPrefix`, references; see the concept table in `MIGRATING.md`), confirm the model and scope with the user, then `pnpm cms:generate && pnpm cms:push`.
3. Write one `migration/<type>.map.ts` per source type with `defineMapping` / `skipSource` from `@kidecms/core/importer`. Every source path must be read by `map` or listed in `drop` with a reason.
4. `pnpm exec kide import plan` until READY, fixing what `.kide/import/ledger.md` lists (unaccounted paths, invalid shapes, dangling refs and terms, bundled terms, missing media, low text recall).
5. `pnpm exec kide import apply` → `pnpm exec kide import verify` → `pnpm exec kide import check-live` → check `/admin`, `pnpm check`, `pnpm test`.

**Other sources**: an importer script with `createCmsContext()` + `load(items, { dryRun: true })`, as described in `MIGRATING.md`.
