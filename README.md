# Kide CMS

A code-first CMS for Astro. Define collections in TypeScript and get a generated admin UI and typed content API.

- [Live demo](https://demo.kide.dev/admin)
- [Docs](https://docs.kide.dev/)

## Quick Start

```bash
pnpx create kide-app
```

Pick how the runtime lives in your project:

- **Package** - the runtime is an `@kidecms/core` npm dependency in `node_modules`. Updates are a version bump.
- **Embedded** - the CMS runtime, admin UI, and routes sit in `src/cms/` as part of your project. Everything is there to read, debug, and change. Upgrades come as patches you review and apply yourself.

Pick a deploy target:

- **Node.js** - runs anywhere Node runs, SQLite for storage.
- **Cloudflare** - deploys as a Worker; provisions D1 + R2 for you.

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
- Full-text search (FTS5, snippet highlighting)
- Editorial review workflow with comments and approval gates
- Outbound and inbound webhooks
- Durable background task queue with retries and recurring schedules
- Built-in forms with a visual builder
- Multisite support
- Audit log
- Reusable shared content sections
- MCP server for AI-agent content editing

## Stack

Astro 7, React 19, Drizzle ORM, SQLite/D1, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
