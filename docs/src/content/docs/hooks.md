---
title: Hooks
description: Lifecycle hooks for content operations.
---

Define hooks directly in your collection config. They run inside the local API on every operation.

```typescript
// src/cms/collections/posts.ts
import { defineCollection, fields } from "../core/define";
import { richTextToPlainText } from "../core/values";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  fields: {
    title: fields.text({ required: true }),
    body: fields.richText(),
    excerpt: fields.text({ maxLength: 300 }),
  },
  hooks: {
    beforeCreate(data, context) {
      // Auto-generate excerpt from body
      if (!data.excerpt && typeof data.body === "object") {
        data.excerpt = richTextToPlainText(data.body).slice(0, 180);
      }
      return data;
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
  },
});
```

## Available Hooks

| Hook              | Arguments                   | Return        |
| ----------------- | --------------------------- | ------------- |
| `beforeCreate`    | `(data, context)`           | Modified data |
| `afterCreate`     | `(doc, context)`            | —             |
| `beforeUpdate`    | `(data, existing, context)` | Modified data |
| `afterUpdate`     | `(doc, context)`            | —             |
| `beforeDelete`    | `(doc, context)`            | —             |
| `afterDelete`     | `(doc, context)`            | —             |
| `beforePublish`   | `(doc, context)`            | —             |
| `afterPublish`    | `(doc, context)`            | —             |
| `beforeUnpublish` | `(doc, context)`            | —             |
| `afterUnpublish`  | `(doc, context)`            | —             |
| `beforeSchedule`  | `(doc, context)`            | —             |
| `afterSchedule`   | `(doc, context)`            | —             |

`before*` hooks on create/update receive the data and can modify it before saving. All other `before*` hooks can throw to abort the operation. `after*` hooks are for side effects like cache invalidation.

## Context

```typescript
{
  user: { id, role, email } | null,
  operation: "create" | "update" | "delete" | ...,
  collection: "posts",
  timestamp: "2025-01-01T00:00:00Z",
  cache: {
    invalidate: ({ tags: string[] }) => void
  }
}
```

## Cache Invalidation

Use `context.cache.invalidate()` in `after*` hooks to purge Astro's route cache:

```typescript
afterPublish(doc, context) {
  context.cache?.invalidate({
    tags: ["posts", `post:${doc._id}`]
  });
},
```

Tag your Astro pages to match:

```astro
---
Astro.cache.set({ tags: ["posts", `post:${post._id}`] });
---
```
