---
title: Getting Started
description: Code-first, single-schema CMS built inside Astro.
---

Code-first, single-schema CMS built inside an Astro app. ~3k lines of core engine.

Collections config generates everything: Drizzle tables, TypeScript types, and a runtime admin UI.

Supports Astro 6's route caching with tag-based invalidation for static-speed content delivery.

[Try live demo](https://demo.kide.dev/admin)

## Quick Start

```bash
pnpx create-kide-app
```

Or just manually clone the [repo](https://github.com/mhernesniemi/kide-cms) and run `pnpm i && pnpm dev`.

## Commands

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `pnpm dev`          | Start dev server (auto-generates schema, pushes to DB) |
| `pnpm build`        | Production build                                       |
| `pnpm check`        | Type-check (astro check) + lint (eslint)               |
| `pnpm format`       | Format with Prettier                                   |
| `pnpm cms:generate` | Regenerate .generated/ from cms.config.ts              |
| `pnpm cms:seed`     | Seed database with demo content                        |
| `pnpm db:generate`  | Generate migration SQL from schema changes             |
| `pnpm db:migrate`   | Apply pending migrations                               |

In dev mode, schema changes are pushed to the DB automatically. Migration files are for production deployments.

## Project Structure

```
src/cms/
  cms.config.ts           # CMS config (database, locales, collection imports)
  collections/            # One file per collection (schema, access rules)
  access.ts               # Auto-aggregated access rules (from collection configs)
  hooks.ts                # Lifecycle hooks
  core/                   # CMS runtime (editable)
  .generated/             # Auto-generated (don't edit)
    schema.ts             # Drizzle tables
    types.ts              # TypeScript interfaces
    validators.ts         # Zod schemas
    api.ts                # Typed API
```

## Environment Variables

All optional. Set in `.env` for local dev, or as secrets on your deployment platform.

| Variable            | Description                                   |
| ------------------- | --------------------------------------------- |
| `AI_PROVIDER`       | AI provider (`openai`)                        |
| `AI_API_KEY`        | AI provider API key                           |
| `AI_MODEL`          | AI model name (e.g. `gpt-4o-mini`)            |
| `RESEND_API_KEY`    | Enables automatic invite emails for new users |
| `RESEND_FROM_EMAIL` | Email sender address                          |
| `CRON_SECRET`       | Secures the scheduled publishing endpoint     |

## Stack

Astro 6, React 19, Drizzle ORM, SQLite (local) / D1 (Cloudflare), Zod, Tiptap, shadcn/ui, Tailwind CSS v4
