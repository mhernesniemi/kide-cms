# Kide CMS

Code-first, single-schema CMS built inside Astro 6. Monolith — no separate API server.

## Commands

```bash
pnpm dev              # start dev server (auto-generates schema + pushes DB)
pnpm build            # production build
pnpm check            # astro check (types) + eslint (lint)
pnpm format           # prettier --write .
pnpm cms:generate     # regenerate .generated/ from cms.config.ts
pnpm cms:seed         # seed database with demo content
```

## Validation (IMPORTANT)

After code changes, ALWAYS run:

1. `pnpm check` — Fix all errors before considering the task done.
2. `pnpm format` — Must be the very last step.

## Key Files

| File                                          | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `src/cms/cms.config.ts`                       | Single source of truth — defines all collections   |
| `src/cms/access.ts`                           | Access control rules                               |
| `src/cms/hooks.ts`                            | Lifecycle hooks (beforeCreate, afterPublish, etc.) |
| `src/cms/core/`                               | CMS runtime (editable, not an npm package)         |
| `src/cms/.generated/`                         | Auto-generated — DO NOT EDIT                       |
| `src/pages/admin/[...path].astro`             | Single catch-all route for all admin views         |
| `src/pages/api/cms/[collection]/[...path].ts` | HTTP API (thin transport for admin islands)        |

## Rules

- Never edit `.generated/` files — they're overwritten on every generation.
- DB columns use `snake_case`, TS fields use `camelCase`. System fields prefixed with `_`.
- Rich text is JSON AST, never HTML or Markdown in storage.
- Admin styles use shadcn CSS variables. Public site uses plain Tailwind colors — no shared styles.
- `labelField` on collections controls display name (fallback: title → name → first text field).
- Always query content through the typed local API (`cms.posts.findOne()`, `cms.pages.find()`, etc.) — never bypass it with raw DB queries or untyped wrappers.

## Stack

Astro 6, React 19, Drizzle ORM (SQLite dev), Zod, Tiptap, shadcn/ui, Tailwind CSS v4, PBKDF2 auth, nanoid, Sharp (image optimization), pnpm, Node >=22.12.0

## Field Types

`text`, `slug`, `email`, `number`, `boolean`, `date`, `select`, `richText`, `image`, `relation`, `array`, `json`, `blocks`
