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
import { cacheTags } from "@kide/core";

const isPreview = Astro.url.searchParams.has("preview");
const doc = await cms.posts.findOne({ slug: Astro.params.slug!, status: isPreview ? "any" : "published" });
if (!doc) return Astro.redirect("/");
if (!isPreview) Astro.cache.set({ tags: cacheTags("posts", doc._id) });
---

<h1>{doc.title}</h1>
```

## Custom Field Components

Create a React component in `src/cms/admin/fields/` and reference it by name:

```typescript
// In your collection definition
color: fields.text({
  admin: { component: "ColorPicker" },
});
```

```tsx
// src/cms/admin/fields/ColorPicker.tsx
import type { CustomFieldProps } from "@kide/core";

export default function ColorPicker({ name, value, readOnly }: CustomFieldProps) {
  return (
    <input
      type="color"
      name={name}
      defaultValue={value || "#000000"}
      disabled={readOnly}
    />
  );
}
```

The component receives `name` (form field name), `field` (field config), `value` (serialized value), and `readOnly`. It renders with `client:load` and must include an input with the `name` prop so the form can read its value.

Built-in component variants: `"radio"` (select as radio buttons), `"taxonomy-select"` (taxonomy term picker), `"repeater"` (JSON array editor), `"menu-items"`, `"taxonomy-terms"`.

## Custom Navigation

Add custom pages to the admin sidebar via `admin.nav` in your CMS config:

```typescript
export default defineConfig({
  admin: {
    nav: [
      { label: "Dashboard", href: "/dashboard", icon: "Home", weight: -10 },
      { label: "Analytics", href: "/analytics", icon: "BarChart", weight: 15 },
      { label: "Settings", href: "/settings", icon: "Settings" },
    ],
  },
  collections: [...],
});
```

| Option   | Type     | Description                                      |
| -------- | -------- | ------------------------------------------------ |
| `label`  | `string` | Display text in the sidebar                      |
| `href`   | `string` | Link URL                                         |
| `icon`   | `string` | Lucide icon name (optional, defaults to grid)    |
| `weight` | `number` | Sort order (optional, default `50`)              |

Items are sorted by weight and interleaved with built-in items:

| Weight | Built-in items                                       |
| ------ | ---------------------------------------------------- |
| 0      | Recent                                               |
| 10     | Content collections                                  |
| 20     | Singles                                              |
| 30     | Pinned utilities (taxonomies, menus, authors, users) |
| 40     | Assets                                               |
| 50     | Custom items (default)                               |

Use `weight: -10` to place an item before Recent, or `weight: 15` to insert between collections and singles.

The linked pages are regular Astro pages you create in your app. To use the admin layout, import it from `@kide/core`:

```astro
---
import AdminLayout from "@kide/core/admin/layouts/AdminLayout.astro";
---

<AdminLayout title="Analytics | Admin">
  <h1>Analytics</h1>
  <!-- your content -->
</AdminLayout>
```

Available icons: `BarChart`, `Bell`, `Bookmark`, `Calendar`, `Clock`, `Database`, `FileText`, `FolderTree`, `Globe`, `Home`, `Image`, `Key`, `Layers`, `LayoutGrid`, `Link`, `Lock`, `Mail`, `Menu`, `MessageSquare`, `Package`, `Palette`, `PencilRuler`, `Search`, `Settings`, `Shield`, `Star`, `Tag`, `Terminal`, `Users`, `Zap`.

## Admin Config

Configure admin behavior in your CMS config:

```typescript
export default defineConfig({
  admin: {
    pageSize: 50,
    uploads: {
      allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/zip"],
      maxFileSize: 100 * 1024 * 1024, // 100 MB
    },
    rateLimit: {
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000, // 5 minutes
    },
  },
  collections: [...],
});
```

### Uploads

| Option         | Type       | Default                                                    | Description              |
| -------------- | ---------- | ---------------------------------------------------------- | ------------------------ |
| `allowedTypes` | `string[]` | Images, PDF, MP4, WebM                                     | Allowed MIME types       |
| `maxFileSize`  | `number`   | `52428800` (50 MB)                                         | Max file size in bytes   |

Default allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `image/svg+xml`, `application/pdf`, `video/mp4`, `video/webm`.

### Rate Limiting

| Option        | Type     | Default    | Description                          |
| ------------- | -------- | ---------- | ------------------------------------ |
| `maxAttempts` | `number` | `5`        | Login attempts before blocking       |
| `windowMs`    | `number` | `900000`   | Time window in ms (default 15 min)   |

### Page Size

| Option     | Type     | Default | Description                        |
| ---------- | -------- | ------- | ---------------------------------- |
| `pageSize` | `number` | `20`    | Number of items per page in lists  |

All settings are optional — defaults apply when omitted.
