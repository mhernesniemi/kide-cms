---
title: Deploy
description: Deployment options and setup helpers.
---

Kide CMS builds on Astro, so you can deploy it anywhere Astro runs. The setup script provides installation helpers for two targets: **Node.js** (local SQLite) and **Cloudflare Workers** (D1 + R2), configuring the database, storage, and image optimization for your choice.

## Cloudflare Setup

### 1. Create the project

```bash
pnpx create-kide-app my-site
# Select "Cloudflare" when prompted
```

This generates a `wrangler.toml` with D1 and R2 bindings.

### 2. Create Cloudflare resources

```bash
cd my-site
pnpm dlx wrangler d1 create my-site-db
pnpm dlx wrangler r2 bucket create my-site-assets
```

Copy the `database_id` from the D1 create output into `wrangler.toml`.

### 3. Push the database schema

```bash
pnpm dlx wrangler d1 migrations apply my-site-db --remote
```

This applies all pending migrations from `src/cms/migrations/` and tracks what's been applied, so it's safe to run on every deploy.

### 4. Deploy

```bash
pnpm run deploy
```

This builds the Astro app and deploys it as a Cloudflare Worker.

### Running migrations in CI

Add the migrations command before the build in your CI/CD or Cloudflare Pages build settings:

```bash
pnpm dlx wrangler d1 migrations apply my-site-db && pnpm build
```

Wrangler tracks applied migrations in a `d1_migrations` table, so only new migrations run. This works automatically in Cloudflare Pages builds since the environment is already authenticated.

### Generating new migrations

When you change your collection schema, generate a new migration:

```bash
pnpm db:generate
```

This regenerates the CMS schema and creates a new SQL migration file in `src/cms/migrations/`. Commit the migration file — it will be applied on the next deploy.

## Wrangler Configuration

The generated `wrangler.toml`:

```toml
name = "my-site"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "CMS_DB"
database_name = "my-site-db"
database_id = ""  # from wrangler d1 create
migrations_dir = "src/cms/migrations"

[triggers]
crons = ["* * * * *"]  # scheduled publishing

[[r2_buckets]]
binding = "CMS_ASSETS"
bucket_name = "my-site-assets"
```

## Storage

On Cloudflare, assets are stored in R2 instead of the local filesystem. The CMS uses a storage abstraction (`src/cms/core/storage.ts`) that the setup script configures:

- **Local/Node.js**: Files go to `public/uploads/`, served by Astro's static file handling
- **Cloudflare**: Files go to R2 via the `CMS_ASSETS` binding, served by a dynamic route at `/uploads/[...path].ts`

No code changes needed. The setup script copies the correct `storage.ts` for your target.

## Database

- **Local/Node.js**: SQLite via `better-sqlite3`, stored at `data/cms.db`
- **Cloudflare**: D1 (Cloudflare's distributed SQLite), accessed via the `CMS_DB` binding

The setup script copies the correct `db.ts` for your target, similar to storage.

## Scheduled Publishing

Kide CMS supports scheduled publish/unpublish for content. The approach differs by target:

### Cloudflare

A cron trigger fires every minute. The CMS integration injects a `scheduled` handler into the built worker entry that calls `/api/cms/cron/publish` internally.

Set the `CRON_SECRET` env var on your worker to secure the endpoint:

```bash
pnpm dlx wrangler secret put CRON_SECRET
```

### Node.js

Set up an external cron job to call the publish endpoint:

```bash
# crontab
* * * * * curl -s -H "Authorization: Bearer YOUR_SECRET" http://localhost:4321/api/cms/cron/publish
```

Set `CRON_SECRET` in your `.env` to match.

In dev mode, the middleware handles scheduled publishing on every request (no external cron needed).

## Image Optimization

- **Local/Node.js**: Sharp-based on-demand transformation via `/api/cms/img/`
- **Cloudflare**: Cloudflare Image Resizing via `/cdn-cgi/image/`. Sharp is not used.

The `cmsImage()` and `cmsSrcset()` helpers detect the runtime and generate the correct URLs automatically.

## Environment Variables

| Variable            | Required    | Description                                |
| ------------------- | ----------- | ------------------------------------------ |
| `CRON_SECRET`       | Recommended | Secures the scheduled publishing endpoint  |
| `RESEND_API_KEY`    | Optional    | Enables automatic invite emails via Resend |
| `RESEND_FROM_EMAIL` | Optional    | Email sender address                       |
| `AI_PROVIDER`       | Optional    | AI provider for content generation         |
| `AI_API_KEY`        | Optional    | AI provider API key                        |
| `AI_MODEL`          | Optional    | AI model name                              |

### Setting variables

**Cloudflare** -- set secrets with Wrangler and non-secret values in `wrangler.toml`:

```bash
pnpm dlx wrangler secret put CRON_SECRET
```

```toml
[vars]
CF_BEACON_TOKEN = "your-token"
```

**Node.js** -- add variables to a `.env` file in the project root:

```ini
CRON_SECRET=your-secret
RESEND_API_KEY=re_xxx
```

### Reading variables in code

On Cloudflare Workers, runtime secrets are **not** available via `import.meta.env`. Astro only exposes build-time and `PUBLIC_`-prefixed variables there. Instead, use the `env` export from `cloudflare:workers`:

```ts
import { env as cfEnv } from "cloudflare:workers";

const env = (key: string) => (cfEnv as Record<string, string>)[key] ?? import.meta.env[key];
```

The `cloudflare:workers` import works both locally (via wrangler emulation during `pnpm dev`) and on deployed Workers. The `import.meta.env` fallback is a safety net but not strictly needed since the Cloudflare runtime always provides the bindings.

Using `import.meta.env` alone will silently return `undefined` for secrets on Cloudflare, causing features like AI and email to appear disabled even when the variables are set.

## Local Development

For Cloudflare projects, `pnpm dev` uses Astro's dev server with local D1/R2 emulation via miniflare. Your wrangler.toml bindings work locally without any extra setup.

## Node.js Deployment

For Node.js targets, the build output is a standalone server:

```bash
pnpm build
node dist/server/entry.mjs
```

No extra configuration needed. SQLite database and uploads are stored locally.
