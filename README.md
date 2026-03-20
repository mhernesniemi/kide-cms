# Kide CMS for Astro 6

Code-first, single-schema CMS built inside an Astro app. ~2k lines of core engine.

Collections config defines everything: Drizzle tables, TypeScript types, and a runtime admin UI.

Supports Astro 6's route caching with tag-based invalidation for static-speed content delivery.

[Try live demo](https://kide-cms.vercel.app/admin)

## Quick Start

```bash
pnpx create-kide-app my-site
```

Or just manually clone this repo and run `pnpm i && pnpm dev`.

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
- Runtime admin UI with field editors, DataTable, live preview
- Drafts, publishing, scheduling, versioning
- i18n with per-field translation tables
- Asset management with folders and focal points
- On-demand image optimization
- Rich text editor (Tiptap)
- Block editor with repeater fields
- Hierarchical taxonomies and menus
- Role-based access control
- Tag-based cache invalidation
- AI assistant (alt text, SEO, translations)

[Full documentation](https://kide-cms.vercel.app/docs)

## Stack

Astro 6, React 19, Drizzle ORM, SQLite, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
