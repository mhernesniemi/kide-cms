---
title: Admin UI
description: Customizing the admin panel.
---

The admin is runtime-rendered from your schema. No generated page files, add a field and it appears immediately.

## View Customization

### List columns

Configure which columns appear in the list view via `views` in the collection definition:

```typescript
defineCollection({
  slug: "posts",
  views: {
    list: {
      columns: ["title", "category", "_status", "_updatedAt"],
      defaultSort: { field: "_updatedAt", direction: "desc" },
    },
  },
  fields: { ... },
});
```

### Field position

Fields go to the content area by default. Set `admin.position: "sidebar"` to place a field in the sidebar:

```typescript
fields: {
  title: fields.text({ required: true }),                              // → content
  body: fields.richText(),                                              // → content
  slug: fields.slug({ admin: { position: "sidebar" } }),               // → sidebar
  category: fields.text({ admin: { position: "sidebar" } }),           // → sidebar
}
```

| Position    | Description                                 |
| ----------- | ------------------------------------------- |
| `"content"` | Main area (left column on desktop), default |
| `"sidebar"` | Side panel (right column on desktop)        |

## Preview

Collections with `pathPrefix` get a Preview link automatically. For collections without a prefix, add `preview: true`. For singletons, set `preview` to the URL:

```typescript
// Automatic: pathPrefix enables preview
defineCollection({ slug: "posts", pathPrefix: "blog", ... });

// Explicit: no pathPrefix, needs opt-in
defineCollection({ slug: "pages", preview: true, ... });

// Singleton: set the URL directly
defineCollection({ slug: "front-page", singleton: true, preview: "/", ... });
```

The Preview link opens the public page in a new tab with `?preview=true`, which shows draft content. Save your changes in the admin, then refresh the preview tab to see them.

### Public page setup

Check for the `?preview` param and query with `status: "any"` in preview mode:

```astro
---
import { cms } from "@/cms/.generated/api";
import { cacheTags } from "@/cms/core/content";

const isPreview = Astro.url.searchParams.has("preview");
const doc = await cms.posts.findOne({ slug: Astro.params.slug!, status: isPreview ? "any" : "published" });
if (!doc) return Astro.redirect("/");
if (!isPreview) Astro.cache.set({ tags: cacheTags("posts", doc._id) });
---

<h1>{doc.title}</h1>
```

## Custom Field Components

Register a custom React component for any field:

```typescript
// In your collection definition
color: fields.text({
  admin: { component: "color-picker" },
});
```

Built-in custom components: `"radio"` (select as radio buttons), `"taxonomy-select"` (taxonomy term picker), `"repeater"` (JSON array editor), `"menu-items"`, `"taxonomy-terms"`.
