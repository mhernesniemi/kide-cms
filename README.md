# AstroCMS

Code-first, single-schema CMS built inside an Astro app.

One config file defines everything: Drizzle tables, Zod validators, end-to-end TypeScript types, and a runtime admin UI are all generated from it.

Supports Astro 6's route caching with tag-based invalidation for static-speed content delivery.

## Quick Start

```bash
pnpm i
pnpm dev
```

Open `http://localhost:4321/admin`, you'll be prompted to create your admin account on first run.

## Key Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm db:generate      # Generate DB migrations
pnpm db:migrate       # Apply migrations
```

## How It Works

Define collections in `src/cms/collections.config.ts`:

```typescript
defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  drafts: true,
  fields: {
    title: fields.text({ required: true, translatable: true }),
    body: fields.richText({ translatable: true }),
    author: fields.relation({ collection: "authors" }),
  },
});
```

Use the local API anywhere in server code:

```typescript
import { cms } from "./cms/.generated/api";

const posts = await cms.posts.find({ status: "published" });
const post = await cms.posts.create({ title: "Hello" });
```

## Hooks

Lifecycle hooks in `src/cms/hooks.ts` run inside the API on every operation — transform data, validate, trigger side effects, invalidate cache:

```typescript
posts: {
  beforeCreate(data) {
    if (!data.excerpt && data.body) {
      data.excerpt = richTextToPlainText(data.body).slice(0, 180);
    }
    return data;
  },
  afterPublish(doc, context) {
    context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
  },
}
```

## Features

- Schema-driven code generation (Drizzle + Zod + TypeScript)
- Runtime admin UI with field editors, DataTable, live preview
- Drafts, publishing, scheduling, versioning
- i18n with per-field translation tables
- Asset management with folders and focal points
- Rich text editor (Tiptap) with image support
- Block editor with repeater fields
- Role-based access control
- Session auth (Argon2 + HttpOnly cookies)
- Tag-based cache invalidation

## Stack

Astro 6, React 19, Drizzle ORM, SQLite, Zod, Tiptap, shadcn/ui, Tailwind CSS v4
