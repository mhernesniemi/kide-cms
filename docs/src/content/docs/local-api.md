---
title: Local API
description: Query and mutate content from server code.
---

Import the generated API and call it directly without HTTP overhead. All queries and return types are fully typed based on your collection definitions.

```typescript
import { cms } from "./cms/.generated/api";
```

Every collection is available as `cms.<collection-slug>`. For example, if you have collections `posts`, `pages`, and `users`:

```typescript
cms.posts.find({ ... })
cms.pages.findOne({ slug: "about" })
cms.users.findById("abc123")
```

## Find

```typescript
const posts = await cms.posts.find({
  where: { category: "tech" },
  sort: { field: "_updatedAt", direction: "desc" },
  limit: 10,
  offset: 0,
  status: "published",
  locale: "fi",
});
```

| Option   | Type                                             | Default                                               | Description                        |
| -------- | ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------- |
| `where`  | `Record<string, unknown>`                        | —                                                     | Filter by field values             |
| `sort`   | `{ field, direction }`                           | —                                                     | Sort by field, `"asc"` or `"desc"` |
| `limit`  | `number`                                         | —                                                     | Max documents to return            |
| `offset` | `number`                                         | —                                                     | Skip N documents                   |
| `status` | `"draft" \| "published" \| "scheduled" \| "any"` | `"published"` (drafts collections) / `"any"` (others) | Filter by status                   |
| `locale` | `string`                                         | default locale                                        | Language code for translations     |

## Find One

```typescript
const post = await cms.posts.findOne({
  slug: "hello-world",
  locale: "fi",
  status: "any",
});
```

| Option          | Type                                             | Default                                               | Description                                |
| --------------- | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------ |
| _field filters_ | varies                                           | —                                                     | Filter by any field (e.g. `slug`, `email`) |
| `locale`        | `string`                                         | default locale                                        | Language code                              |
| `status`        | `"draft" \| "published" \| "scheduled" \| "any"` | `"published"` (drafts collections) / `"any"` (others) | Status filter                              |

## Find by ID

```typescript
const post = await cms.posts.findById("abc123", {
  locale: "fi",
  status: "any",
});
```

| Option   | Type                                             | Default                                               | Description   |
| -------- | ------------------------------------------------ | ----------------------------------------------------- | ------------- |
| `locale` | `string`                                         | default locale                                        | Language code |
| `status` | `"draft" \| "published" \| "scheduled" \| "any"` | `"published"` (drafts collections) / `"any"` (others) | Status filter |

## Create

```typescript
const post = await cms.posts.create({
  title: "New Post",
  body: { type: "root", children: [...] },
  _status: "published", // optional, defaults to "draft" if drafts enabled
});
```

Pass field values as properties. Returns the created document.

## Update

```typescript
const post = await cms.posts.update("abc123", {
  title: "Updated Title",
});
```

Only include fields you want to change. Returns the updated document.

## Delete

```typescript
await cms.posts.delete("abc123");
```

Cascades: removes translations, versions, and the document.

## Publish / Unpublish

```typescript
await cms.posts.publish("abc123");
await cms.posts.unpublish("abc123");
```

## Discard Draft

```typescript
await cms.posts.discardDraft("abc123");
```

Reverts a published document's pending changes back to the last-published content. Only works on published documents that have been edited.

## Schedule

```typescript
await cms.posts.schedule(
  "abc123",
  "2025-06-01T00:00:00Z", // publishAt (required)
  "2025-07-01T00:00:00Z", // unpublishAt (optional)
);
```

Sets status to `"scheduled"`. On Cloudflare, a cron trigger processes scheduled publishing automatically. For Node.js, set up an external cron to call `/api/cms/cron/publish`. Set the `CRON_SECRET` env var to secure the endpoint.

## Count

```typescript
const total = await cms.posts.count({ status: "published" });
```

Accepts same filter options as `find` (without `limit`, `offset`, `sort`).

## Versions

```typescript
const versions = await cms.posts.versions("abc123");
// → [{ version: 5, createdAt: "...", snapshot: {...} }, ...]

await cms.posts.restore("abc123", 5);
```

## Translations

```typescript
const translations = await cms.posts.getTranslations("abc123");
// → { fi: { title: "...", body: {...} } }

await cms.posts.upsertTranslation("abc123", "fi", {
  title: "Hei maailma",
  body: { type: "root", children: [...] },
});
```

`upsertTranslation` inserts or updates. Only include translatable fields.

## Introspection

```typescript
cms.meta.getCollections(); // All collections with metadata
cms.meta.getFields("posts"); // Field definitions for a collection
cms.meta.getCollection("posts"); // Full collection config
cms.meta.getRouteForDocument("posts", doc); // Public URL for a document
cms.meta.getLocales(); // { default, supported }
cms.meta.isTranslatableField("posts", "title"); // true/false
```

## Usage in Astro Pages

```astro
---
import { cms } from "@/cms/.generated/api";

const post = await cms.posts.findOne({ slug: Astro.params.slug });
if (!post) return Astro.redirect("/404");

Astro.cache.set({ tags: ["posts", `post:${post._id}`] });
---

<h1>{post.title}</h1>
```
