# Kide CMS

Code-first, single-schema CMS built inside Astro 6. Runtime, admin UI, routes, and middleware all live inside `src/cms/`. No external package boundary — own your code.

## Repo Structure

```
src/
  cms/
    cms.config.ts         # CMS configuration (collections, admin, locales)
    collections/          # Collection definitions
    adapters/             # db, email, storage adapters
    internals/            # Thin runner scripts (runtime, generator, seed, create-admin)
    migrations/           # Drizzle migrations
    .generated/           # Auto-generated schema/types/validators/api (do not edit)
    integration.ts        # Astro integration (route injection, virtual modules)
    virtual.d.ts          # Ambient types for virtual:kide/* modules
    core/                 # CMS runtime library (define, api, auth, schema, content, ...)
    admin/                # Admin UI (components, layouts, lib)
    routes/               # Admin pages + API routes (injected by integration)
    middleware/           # Auth middleware (injected by integration)
    client/               # preview.ts — browser-side live-preview client
  components/             # App-level components (incl. BlockRenderer)
  layouts/, pages/, styles/, env.d.ts
docs/                     # Standalone Starlight docs site (own package.json)
```

## Commands

```bash
pnpm dev              # start dev server (auto-generates schema + pushes DB)
pnpm build            # production build
pnpm preview          # preview production build
pnpm check            # astro check (types) + eslint (lint)
pnpm format           # prettier --write .
pnpm cms:generate     # regenerate src/cms/.generated/ from cms.config.ts
pnpm cms:seed         # seed database with demo content
pnpm cms:admin        # create an admin user from CLI
```

## Validation (IMPORTANT)

After code changes, ALWAYS run:

1. `pnpm check` — Fix all errors before considering the task done.
2. `pnpm format` — Must be the very last step.

## Key Files

| File                     | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `src/cms/cms.config.ts`  | Top-level CMS config — collections, admin, locales    |
| `src/cms/collections/`   | Collection schemas                                    |
| `src/cms/adapters/`      | Project-specific db / email / storage adapters        |
| `src/cms/internals/`     | Thin runner scripts (runtime wiring, generator, etc.) |
| `src/cms/integration.ts` | Astro integration (route injection, virtual modules)  |
| `src/cms/core/`          | CMS runtime library (edit to change behavior)         |
| `src/cms/admin/`         | Admin UI components, layouts, styles                  |
| `src/cms/routes/`        | Admin pages + API routes injected by integration      |
| `src/cms/middleware/`    | Auth middleware injected by integration               |
| `src/cms/client/`        | Browser-side live-preview client                      |

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
