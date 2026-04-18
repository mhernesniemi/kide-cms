# Kide CMS for Astro 6

Code-first, single-schema CMS built inside an Astro app. ~3k lines of core engine, all inlined in `src/cms/` — no external package, no abstraction boundary. Own your code.

Collections config generates everything: Drizzle tables, TypeScript types, and a runtime admin UI.

Supports Astro 6's route caching with tag-based invalidation for static-speed content delivery.

[Try live demo](https://demo.kide.dev/admin)

[Docs](https://docs.kide.dev/)

## Quick Start

```bash
pnpx create-kide-app
```

## How It Works

Define collections in `src/cms/collections/`:

```typescript
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

Use the local API anywhere in server code:

```typescript
import { cms } from "./cms/.generated/api";

const posts = await cms.posts.find({ status: "published" });
const post = await cms.posts.create({ title: "Hello" });
```

Use lifecycle hooks to transform data, validate, trigger side effects, and invalidate cache:

```typescript
posts: {
  afterPublish(doc, context) {
    context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
  },
}
```

## Features

- Custom collections with 13 field types, blocks, and repeaters
- Runtime admin UI with field editors and DataTables
- Drafts, publishing, scheduling, versioning
- i18n with per-field translation tables
- Asset management with folders and focal points
- On-demand image optimization
- Rich text editor (Tiptap)
- Block editor with repeater fields
- Real-time live preview across tabs
- Hierarchical taxonomies and menus
- Role-based access control
- Tag-based cache invalidation
- Optional AI assistant (alt text, SEO, translations)

[Full documentation](https://docs.kide.dev/)

## Stack

Astro 6, React 19, Drizzle ORM, SQLite, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
