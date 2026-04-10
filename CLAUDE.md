# Kide CMS

Code-first, single-schema CMS built inside Astro 6. Monorepo with core package and scaffolding tool.

## Repo Structure

```
packages/kide-core/         # Core runtime, admin UI, routes, integration (@kidecms/core)
packages/create-kide-app/   # CLI scaffolding tool + app templates
  templates/base/            # Minimal starter (users collection only)
  templates/demo/            # Demo overlay (full schema, seed data, public pages)
  templates/local/           # Node.js/SQLite adapter overrides
  templates/cloudflare/      # D1/R2 adapter overrides
examples/basic/              # Working example app (output of create-kide-app with demo)
docs/                        # Documentation (Starlight)
```

## Templates are the source of truth

The `create-kide-app` templates define what users get. `examples/basic/` should be reproducible by running `create-kide-app` with demo content selected. If you change app-level code (adapters, runtime, collections, public pages, styles), change it in the templates — not just in `examples/basic/`.

Files that belong in templates:

- `templates/base/` — adapters, runtime, generator, create-admin, admin.css, public.css, minimal config
- `templates/demo/` — full collections, seed data, blocks renderer, public pages, components, layouts

`examples/basic/` exists for development convenience (running `pnpm dev` from the monorepo root). It should match what `base/ + demo/ + local/` produces.

## Commands

```bash
pnpm dev              # start example dev server (auto-generates schema + pushes DB)
pnpm build            # production build of example
pnpm check            # astro check (types) + eslint (lint)
pnpm format           # prettier --write .
pnpm core:build       # build @kidecms/core package
```

Example-specific commands (run from `examples/basic/` or use `pnpm --filter basic`):

```bash
pnpm cms:generate     # regenerate .generated/ from cms.config.ts
pnpm cms:seed         # seed database with demo content
```

## Validation (IMPORTANT)

After code changes, ALWAYS run:

1. `pnpm check` — Fix all errors before considering the task done.
2. `pnpm format` — Must be the very last step.

## Key Files

| File                                    | Purpose                                              |
| --------------------------------------- | ---------------------------------------------------- |
| `packages/kide-core/src/`               | Core TypeScript runtime (compiled by tsc)            |
| `packages/kide-core/admin/`             | Admin UI components, layouts, styles (raw source)    |
| `packages/kide-core/routes/`            | Admin pages + API routes (injected via integration)  |
| `packages/kide-core/middleware/`        | Auth middleware (injected via integration)           |
| `packages/kide-core/src/integration.ts` | Astro integration (route injection, virtual modules) |
| `packages/create-kide-app/templates/`   | App templates — source of truth for user-facing code |

## Rules

- Use **pnpm** for all package management and scripts (`pnpm install`, `pnpm add`, `pnpm exec`, etc.). Do not use npm or yarn.
- Never edit `.generated/` files — they're overwritten on every generation.
- DB columns use `snake_case`, TS fields use `camelCase`. System fields prefixed with `_`.
- Rich text is JSON AST, never HTML or Markdown in storage.
- Admin styles use shadcn CSS variables. Public site uses plain Tailwind colors — no shared styles.
- `labelField` on collections controls display name (fallback: title → name → first text field).
- Always query content through the typed local API (`cms.posts.findOne()`, `cms.pages.find()`, etc.) — never bypass it with raw DB queries or untyped wrappers.
- Routes in `packages/kide-core/routes/` import app-specific code via `virtual:kide/*` modules (resolved by the integration's Vite aliases).
- Use the `cn()` utility from `@kidecms/core/admin/lib/utils` for conditional class names — never use template literal interpolation for className.
- When changing app-level code, update the templates first — `examples/basic/` should match the scaffolded output.

## Stack

Astro 6, React 19, Drizzle ORM (SQLite dev), Zod, Tiptap, shadcn/ui, Tailwind CSS v4, PBKDF2 auth, nanoid, Sharp (image optimization), pnpm, Node >=22.12.0

## Field Types

All fields share base options: `label`, `description`, `required`, `defaultValue`, `indexed`, `unique`, `translatable`, `condition`, `admin`, `access`.

| Field      | Type-specific options                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| `text`     | `maxLength?: number`                                                            |
| `slug`     | `from?: string` — field to auto-generate slug from                              |
| `email`    | _(base only)_                                                                   |
| `number`   | _(base only)_                                                                   |
| `boolean`  | _(base only)_                                                                   |
| `date`     | _(base only)_                                                                   |
| `select`   | `options: string[]` **(required)**                                              |
| `richText` | _(base only)_ — stored as JSON AST `{ type: "root", children: RichTextNode[] }` |
| `image`    | _(base only)_ — stores asset reference                                          |
| `relation` | `collection: string` **(required)**, `hasMany?: boolean`                        |
| `array`    | `of: FieldConfig` **(required)** — field config for each item                   |
| `json`     | `schema?: string`                                                               |
| `blocks`   | `types: Record<string, Record<string, FieldConfig>>` **(required)**             |

`admin` sub-options: `component`, `placeholder`, `position` (`"content"` \| `"sidebar"`), `rows`, `help`, `hidden`.

`condition`: `{ field: string; value: string | string[] | boolean }` — show/hide field based on another field's value.

`access`: `{ read?, update? }` — functions receiving `{ user, doc, operation, collection }`, return `boolean`.

## Virtual Modules

Routes in `packages/kide-core/routes/` import app-specific code via `virtual:kide/*` aliases (resolved by the integration). Never import user files by path from core routes — use these modules.

| Module                        | Resolves to                          | Exports                                            |
| ----------------------------- | ------------------------------------ | -------------------------------------------------- |
| `virtual:kide/config`         | `src/cms/cms.config`                 | Default `CmsConfig`                                |
| `virtual:kide/api`            | `src/cms/.generated/api`             | `{ cms }` — typed local API                        |
| `virtual:kide/schema`         | `src/cms/.generated/schema`          | `{ cmsTables }` — Drizzle table map                |
| `virtual:kide/runtime`        | `src/cms/internals/runtime`          | Session, auth, assets, AI, locks, `createCms`      |
| `virtual:kide/db`             | `src/cms/adapters/db`                | `{ getDb }` — Drizzle instance                     |
| `virtual:kide/email`          | `src/cms/adapters/email`             | `{ sendInviteEmail, isEmailConfigured }`           |
| `virtual:kide/block-renderer` | `src/components/BlockRenderer.astro` | Default Astro component                            |
| `virtual:kide/admin-css`      | Generated `.kide/admin.css`          | Side-effect import (styles)                        |
| `virtual:kide/custom-fields`  | Generated `.kide/custom-fields.ts`   | `{ customFields }` — custom admin field components |

## Live Preview Protocol

BroadcastChannel `"cms-preview"` connects admin form → preview tab. The client script (`packages/kide-core/client/preview.ts`) is auto-injected by the integration on every page; activates only when `?preview` is in the URL.

**Message shapes (admin → preview):**

| Sender                         | Shape                                  | Preview behavior                                      |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `UnsavedGuard` (form inputs)   | `{ field, value }`                     | Sets `textContent` on `[data-cms="{field}"]` elements |
| `RichTextEditor`               | `{ field, value, render: "richText" }` | POSTs to `/api/cms/preview/render`, sets `innerHTML`  |
| `BlockEditor`                  | `{ field, value, render: "blocks" }`   | POSTs to `/api/cms/preview/render`, sets `innerHTML`  |
| `[...path].astro` (after save) | `{ type: "reload" }`                   | `location.reload()`                                   |

Public pages opt into preview by adding `data-cms="{fieldName}"` attributes to elements. The render endpoint is dev-only (uses Astro Container API).
