---
title: Fields
description: All available field types.
---

## Field Types

| Field      | Storage               | Admin Component                  |
| ---------- | --------------------- | -------------------------------- |
| `text`     | `text`                | Input or Textarea (with `rows`)  |
| `slug`     | `text`                | Auto-generated from source field |
| `email`    | `text`                | Email input                      |
| `number`   | `integer` / `real`    | Number input                     |
| `boolean`  | `integer` (0/1)       | Toggle switch                    |
| `date`     | `text` (ISO 8601)     | Date picker                      |
| `select`   | `text`                | Select dropdown                  |
| `richText` | `text` (JSON AST)     | Tiptap editor                    |
| `image`    | `text`                | Image picker with upload/browse  |
| `relation` | `text` (reference ID) | Combobox with search             |
| `array`    | `text` (JSON)         | Comma-separated input            |
| `json`     | `text` (JSON)         | Textarea or custom component     |
| `blocks`   | `text` (JSON)         | Drag-and-drop block editor       |

## Common Options

All fields accept these options:

| Option              | Type               | Description                                     |
| ------------------- | ------------------ | ----------------------------------------------- |
| `required`          | `boolean`          | Validate as non-empty on save                   |
| `label`             | `string`           | Custom label (defaults to humanized field name) |
| `description`       | `string`           | Text shown below the label                      |
| `defaultValue`      | varies             | Initial value for new documents                 |
| `translatable`      | `boolean`          | Store per-locale in translations table          |
| `indexed`           | `boolean`          | Add database index                              |
| `unique`            | `boolean`          | Enforce unique values                           |
| `condition`         | `{ field, value }` | Show/hide based on another field                |
| `admin.placeholder` | `string`           | Input placeholder text                          |
| `admin.rows`        | `number`           | Textarea height (text fields)                   |
| `admin.help`        | `string`           | Help text below the input                       |
| `admin.position`    | `"sidebar"`        | Place field in sidebar instead of content area  |
| `admin.hidden`      | `boolean`          | Hide from admin UI                              |
| `admin.component`   | `string`           | Custom admin component (see [Admin UI](/admin-ui/#custom-field-components)) |

## Blocks

```typescript
fields.blocks({
  types: {
    hero: {
      heading: fields.text({ required: true }),
      body: fields.text(),
      ctaLabel: fields.text(),
      ctaHref: fields.text(),
    },
    text: {
      heading: fields.text(),
      content: fields.richText(),
    },
    faq: {
      heading: fields.text(),
      items: fields.json({
        defaultValue: [],
        admin: { component: "repeater" },
      }),
    },
  },
});
```

Block sub-fields support: `text`, `number`, `boolean`, `select`, `richText`, `image`, `relation`, `array`.

The `repeater` component renders JSON arrays as grouped add/remove item cards.

## Conditional Fields

Show/hide fields based on a `select` or `boolean` field's value:

```typescript
postType: fields.select({
  options: ["article", "video", "podcast"],
}),
videoUrl: fields.text({
  condition: { field: "postType", value: "video" },
}),
```

The `value` can be a string, boolean, or array of strings (matches any).

## Field-Level Access

Fields support `read` and `update` access rules:

```typescript
import { hasRole } from "@kidecms/core";

summary: fields.text({
  access: {
    read: hasRole("admin"),      // hidden from non-admins
  },
}),
seoDescription: fields.text({
  access: {
    update: hasRole("admin"),    // read-only for non-admins
  },
}),
```

| Rule     | Effect in admin UI                        | Effect on save                                    |
| -------- | ----------------------------------------- | ------------------------------------------------- |
| `read`   | Field is completely hidden                | Field excluded from response                      |
| `update` | Field is rendered as read-only (disabled) | Field value silently preserved (changes stripped) |

Both rules receive the same context as collection-level access rules: `{ user, doc, operation, collection }`.

## AI Assistant

The admin includes optional AI features powered by the Vercel AI SDK. Add `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` to your `.env` to enable them. When configured, AI buttons appear automatically for:

- **Alt text generation** on asset detail pages
- **SEO descriptions** on post/page edit forms
- **Translation** with per-field "Translate from EN" buttons that handle both plain text and rich text (preserving JSON AST structure)

Without the AI env vars, all AI buttons are hidden and no AI dependencies are loaded.
