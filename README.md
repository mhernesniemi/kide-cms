# Kide CMS

A code-first CMS that lives **inside** your Astro project, not beside it.

Instead of importing a CMS package, `create-kide-app` clones this repo as your project. All ~3k lines of the CMS runtime, admin UI, and routes sit in `src/cms/` where you can read, debug, and modify them. No external package boundary, no version pinning against someone else's breaking change, no abstraction you can't open up.

- [Live demo](https://demo.kide.dev/admin)
- [Docs](https://docs.kide.dev/)

## Quick Start

```bash
pnpx create-kide-app my-project
```

You'll be asked for a project name, deploy target (Node.js or Cloudflare), and whether to seed demo content. The CLI clones this repo, installs, initializes git, and (for Cloudflare) provisions D1 + R2 and deploys. You end up with a running app.

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
import { cms } from "./cms/.generated/api";

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

- 13 field types including blocks, repeaters, and relations
- Drafts, publishing, scheduling, versioning
- Per-field i18n via translation tables
- Asset management with folders, focal points, on-demand optimization
- Tiptap rich text, block editor, real-time cross-tab live preview
- Hierarchical taxonomies and menus
- Role-based access control
- Tag-based cache invalidation (Astro 7 route caching)
- Optional AI assistant (alt text, SEO, translations)

## Local MCP

Run Kide as a local stdio MCP server for agent-assisted content editing:

```bash
pnpm cms:mcp
```

Add it to Claude Code from your Kide project root:

```bash
claude mcp add --transport stdio kide -- pnpm cms:mcp
```

Add it to Codex from your Kide project root:

```bash
codex mcp add kide -- pnpm cms:mcp
```

Example MCP client config:

```json
{
  "mcpServers": {
    "kide": {
      "command": "pnpm",
      "args": ["cms:mcp"],
      "cwd": "/path/to/your-kide-project"
    }
  }
}
```

The server exposes collection introspection, document list/get/count, draft-friendly create/update, explicit publish/unpublish/schedule, translations, and asset metadata tools. It also exposes the machine-readable content model as `kide://model`.

By default MCP runs as an admin-like local actor so collection access rules still receive a user:

```bash
KIDE_MCP_USER_ID=mcp-local KIDE_MCP_USER_ROLE=editor KIDE_MCP_USER_EMAIL=editor@example.com pnpm cms:mcp
```

Auth collections are blocked for MCP mutations by default. Set `KIDE_MCP_ALLOW_AUTH_COLLECTIONS=true` only when you intentionally want agent access to auth-backed collections such as users.

## Deploy Targets

- **Node.js**: SQLite via `better-sqlite3`, local filesystem storage.
- **Cloudflare Workers**: D1 for the database, R2 for assets.

Both are wired up by `create-kide-app`. The Cloudflare overlay lives in [`adapters/cloudflare/`](./adapters/cloudflare) and is consumed by the CLI at scaffold time. If you clone this repo directly (not via `create-kide-app`), that folder is scaffolding source and can be deleted.

## Stack

Astro 7, React 19, Drizzle ORM, SQLite/D1, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
