# Kide CMS

Code-first CMS built inside Astro 6.

## Structure

```
src/cms/cms.config.ts        # Collection definitions (source of truth)
src/cms/collections/         # Individual collection files
src/cms/adapters/            # Database, storage, email adapters
src/cms/internals/           # Runtime, generator, seed scripts
src/cms/.generated/          # Auto-generated — never edit
src/components/              # Astro/React components
src/layouts/                 # Page layouts
src/pages/                   # Routes
src/styles/admin.css         # Admin theme overrides (shadcn variables)
src/styles/public.css        # Public site styles (plain Tailwind)
```

## Commands

```bash
pnpm dev              # start dev server (auto-generates schema + pushes DB)
pnpm build            # production build
pnpm cms:generate     # regenerate .generated/ from cms.config.ts
pnpm cms:seed         # seed database with demo content (if configured)
```

## Rules

- Never edit files in `src/cms/.generated/` — they are overwritten on every generation.
- Always query content through the typed local API: `cms.posts.find()`, `cms.pages.findOne()`, etc. Never bypass it with raw DB queries.
- DB columns use `snake_case`, TypeScript fields use `camelCase`. System fields are prefixed with `_`.
- Rich text is stored as JSON AST, never HTML or Markdown.
- Admin styles use shadcn CSS variables. Public site uses plain Tailwind colors — no shared styles between admin and public.
- Use the `cn()` utility from `@kidecms/core/admin/lib/utils` for conditional class names in admin components.
- `labelField` on collections controls display name in the admin (fallback: title, name, or first text field).

## Stack

Astro 6, React 19, Drizzle ORM, Zod, Tiptap, shadcn/ui, Tailwind CSS v4

## Field Types

Defined in collection files via `fields.*`. All fields share base options: `label`, `description`, `required`, `defaultValue`, `indexed`, `unique`, `translatable`, `condition`, `admin`, `access`.

| Field      | Type-specific options                                                           |
| ---------- | ------------------------------------------------------------------------------- |
| `text`     | `maxLength?: number`                                                            |
| `slug`     | `from?: string` — field to auto-generate slug from                              |
| `email`    | _(base only)_                                                                   |
| `number`   | _(base only)_                                                                   |
| `boolean`  | _(base only)_                                                                   |
| `date`     | _(base only)_                                                                   |
| `select`   | `options: string[]` **(required)**                                              |
| `richText` | _(base only)_ — stored as JSON AST `{ type: "root", children: RichTextNode[] }` |
| `image`    | _(base only)_ — stores asset reference                                          |
| `relation` | `collection: string` **(required)**, `hasMany?: boolean`                        |
| `array`    | `of: FieldConfig` **(required)** — field config for each item                   |
| `json`     | `schema?: string`                                                               |
| `blocks`   | `types: Record<string, Record<string, FieldConfig>>` **(required)**             |

`admin` sub-options: `component`, `placeholder`, `position` (`"content"` | `"sidebar"`), `rows`, `help`, `hidden`.

`condition`: `{ field: string; value: string | string[] | boolean }` — show/hide field based on another field's value.

`access`: `{ read?, update? }` — functions receiving `{ user, doc, operation, collection }`, return `boolean`.

## Live Preview

The CMS auto-injects a preview script on every page. To make fields update in real time:

1. Add `?preview` to the page URL.
2. Add `data-cms="{fieldName}"` attributes to elements that display field values.

For rich text and blocks fields, the preview system uses server-side rendering via `/api/cms/preview/render` (dev only). Simple text fields update via `textContent` directly.
