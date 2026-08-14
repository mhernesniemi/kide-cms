# Kide CMS

A code-first CMS for Astro. Define collections in TypeScript, get an admin UI and typed content API for free.

- [Live demo](https://demo.kide.dev/admin)
- [Docs](https://docs.kide.dev/)

## Quick Start

```bash
pnpm create kide-app my-project
```

Pick how the runtime lives in your project:

- **Package** — the runtime is an `@kidecms/core` npm dependency in `node_modules`. Updates are a version bump.
- **Embedded** — the CMS runtime, admin UI, and routes sit in `src/cms/` as part of your project. Everything is there to read, debug, and change. Upgrades come as patches you review and apply yourself.

Pick a deploy target:

- **Node.js** — runs anywhere Node runs, SQLite for storage.
- **Cloudflare** — deploys as a Worker; provisions D1 + R2 for you.

## How It Works

Define collections in `src/cms/collections/`:

```ts
// src/cms/collections/posts.ts

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  drafts: true,
  fields: {
    title: fields.text({ required: true, translatable: true }),
    body: fields.richText({ translatable: true }),
    author: fields.relation({ collection: "authors", admin: { position: "sidebar" } }),
  },
});
```

One config generates everything: Drizzle tables, TypeScript types, a Zod validator, and the runtime admin UI.

Query through the typed local API anywhere in server code:

```ts
import { cms } from "@/cms/.generated/api";

const posts = await cms.posts.find({ status: "published" });
const post = await cms.posts.create({ title: "Hello" });
```

Hook into the lifecycle to transform, validate, or invalidate cache:

```ts
posts: {
  afterPublish(doc, context) {
    context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
  },
}
```

## Features

- 14 field types including blocks, repeaters, and relations
- Drafts, publishing, scheduling, versioning
- Per-field i18n via translation tables
- Asset management with folders, focal points, on-demand optimization
- Tiptap rich text, block editor, real-time cross-tab live preview
- Hierarchical taxonomies and menus
- Role-based access control
- Tag-based cache invalidation (Astro 7 route caching)
- Optional AI assistant (alt text, SEO, translations)

## Local MCP

Kide ships a local stdio MCP server (`pnpm cms:mcp`) so agents like Claude Code and Codex can inspect collections and edit content through the same schema-aware API your server code uses — drafts by default, publishing always explicit.

See the [MCP docs](https://docs.kide.dev/mcp/) for client setup (Claude Code, Codex, generic config), the access-rule actor, and safety defaults.

## Deploy Targets

- **Node.js**: SQLite via `better-sqlite3`, local filesystem storage.
- **Cloudflare Workers**: D1 for the database, R2 for assets.

Both are wired up by `create-kide-app`. The Cloudflare overlay lives in [`adapters/cloudflare/`](./adapters/cloudflare) and is consumed by the CLI at scaffold time. If you clone this repo directly (not via `create-kide-app`), that folder is scaffolding source and can be deleted.

## Stack

Astro 7, React 19, Drizzle ORM, SQLite/D1, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
