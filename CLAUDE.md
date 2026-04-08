# Kide CMS

Code-first, single-schema CMS built inside Astro 6. Monorepo with core package and scaffolding tool.

## Repo Structure

```
packages/kide-core/         # Core runtime, admin UI, routes, integration (@kide/core)
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
pnpm core:build       # build @kide/core package
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

| File | Purpose |
| --- | --- |
| `packages/kide-core/src/` | Core TypeScript runtime (compiled by tsc) |
| `packages/kide-core/admin/` | Admin UI components, layouts, styles (raw source) |
| `packages/kide-core/routes/` | Admin pages + API routes (injected via integration) |
| `packages/kide-core/middleware/` | Auth middleware (injected via integration) |
| `packages/kide-core/src/integration.ts` | Astro integration (route injection, virtual modules) |
| `packages/create-kide-app/templates/` | App templates — source of truth for user-facing code |

## Rules

- Use **pnpm** for all package management and scripts (`pnpm install`, `pnpm add`, `pnpm exec`, etc.). Do not use npm or yarn.
- Never edit `.generated/` files — they're overwritten on every generation.
- DB columns use `snake_case`, TS fields use `camelCase`. System fields prefixed with `_`.
- Rich text is JSON AST, never HTML or Markdown in storage.
- Admin styles use shadcn CSS variables. Public site uses plain Tailwind colors — no shared styles.
- `labelField` on collections controls display name (fallback: title → name → first text field).
- Always query content through the typed local API (`cms.posts.findOne()`, `cms.pages.find()`, etc.) — never bypass it with raw DB queries or untyped wrappers.
- Routes in `packages/kide-core/routes/` import app-specific code via `virtual:kide/*` modules (resolved by the integration's Vite aliases).
- Use the `cn()` utility from `@kide/core/admin/lib/utils` for conditional class names — never use template literal interpolation for className.
- When changing app-level code, update the templates first — `examples/basic/` should match the scaffolded output.

## Stack

Astro 6, React 19, Drizzle ORM (SQLite dev), Zod, Tiptap, shadcn/ui, Tailwind CSS v4, PBKDF2 auth, nanoid, Sharp (image optimization), pnpm, Node >=22.12.0

## Field Types

`text`, `slug`, `email`, `number`, `boolean`, `date`, `select`, `richText`, `image`, `relation`, `array`, `json`, `blocks`
