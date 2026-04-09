---
title: Collections
description: Define your content schema.
---

Collections are defined in `src/cms/collections/` and registered in `src/cms/cms.config.ts`. Each collection becomes a database table, a set of TypeScript types, Zod validators, and an admin UI.

## Basic Collection

```typescript
// src/cms/collections/posts.ts
import { defineCollection, fields, hasRole } from "@kidecms/core";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  timestamps: true,
  drafts: true,
  versions: { max: 20 },
  access: {
    publish: hasRole("admin"),
  },
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({
      from: "title",
      unique: true,
      admin: { position: "sidebar" },
    }),
    body: fields.richText(),
    author: fields.relation({
      collection: "authors",
      admin: { position: "sidebar" },
    }),
  },
});
```

Register it in `src/cms/cms.config.ts`:

```typescript
import { defineConfig } from "@kidecms/core";
import posts from "./collections/posts";

export default defineConfig({
  database: { dialect: "sqlite" },
  collections: [posts],
});
```

## Collection Options

| Option       | Type                   | Default | Description                                    |
| ------------ | ---------------------- | ------- | ---------------------------------------------- |
| `slug`       | `string`               | —       | URL-safe identifier, used as table name prefix |
| `labels`     | `{ singular, plural }` | —       | Display names in admin                         |
| `singleton`  | `boolean`              | `false` | Single document (e.g., front page)             |
| `timestamps` | `boolean`              | `false` | Auto `_createdAt` / `_updatedAt`               |
| `drafts`     | `boolean`              | `false` | Enable draft/published status                  |
| `versions`   | `{ max: number }`      | —       | Keep version snapshots                         |
| `pathPrefix` | `string`               | —       | URL prefix for public pages (e.g., `"blog"`)   |
| `preview`    | `boolean \| string`    | `false` | Enable preview link (string for static URL)    |
| `labelField` | `string`               | `title` | Field used as document display name            |
| `access`     | `object`               | —       | Role-based access rules (see Access Control)   |
| `hooks`      | `object`               | —       | Lifecycle hooks (see Hooks)                    |
| `views`      | `object`               | —       | List column config (see Admin UI)              |
| `auth`       | `boolean`              | `false` | Enable login/session handling                  |

## Label Field

By default, the admin uses the `title` field as the document display name (in relation selects, DataTable, breadcrumbs). If your collection doesn't have a `title` field, or you want a different field, set `labelField`:

```typescript
defineCollection({
  slug: "authors",
  labels: { singular: "Author", plural: "Authors" },
  labelField: "name",
  fields: {
    name: fields.text({ required: true }),
    title: fields.text(), // work title, not the display name
  },
});
```

Fallback chain: `labelField` → field named `title` → field named `name` → first text field.

## Singletons

```typescript
defineCollection({
  slug: "front-page",
  labels: { singular: "Front Page", plural: "Front Page" },
  singleton: true,
  fields: { ... },
})
```

Singletons show under "Singles" in the sidebar. One document per collection.

## Internationalization

Enable locales in `cms.config.ts` and mark fields as `translatable`:

```typescript
// src/cms/cms.config.ts
export default defineConfig({
  locales: {
    default: "en",
    supported: ["en", "fi"],
  },
  collections: [posts],
});
```

```typescript
// src/cms/collections/posts.ts
fields: {
  title: fields.text({ translatable: true }),
  body: fields.richText({ translatable: true }),
  category: fields.select({ options: ["tech", "design"] }), // not translated
}
```

Translatable fields get a separate `_translations` table. Non-translatable fields stay on the main table. The admin shows a language switcher on edit pages.
