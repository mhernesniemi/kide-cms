---
name: migrate
description: Migrate content from another CMS (WordPress, Payload, Contentful, …) into this Kide project. Use when importing/porting external content, doing a bulk content load, or building an importer.
---

# Migrating content into Kide

Follow **[`MIGRATING.md`](../../../MIGRATING.md)** at the repo root — it's the canonical, always-present playbook (this skill just points at it). The short version:

1. `pnpm cms:describe` → read `MODEL.md` (the authoritative field/control/value-shape map).
2. Design + declare target collections so each field shows a real control (relations `hasMany`, `fields.color()`, `fields.link()`, `fields.image()`, typed `repeater` with `itemFields`, `slug({ unique:false })`). `pnpm cms:generate && pnpm cms:push` (`RECREATE=slug` for renames).
3. Write an importer with `createCmsContext()`; upload media with `assets.upload(file, { dedupe:true })`.
4. `load(items, { dryRun:true })` → fix everything it flags → `load(items)` → `reindex()`.
5. Verify in `/admin`: proper controls, resolved images/relations, locales + search.

Read `AGENTS.md` and `MIGRATING.md` for the full contract, gotchas, and the WordPress/ACF recipe.
