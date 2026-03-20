# Kide CMS

Code-first, single-schema, AI-native CMS built inside an Astro 6 app. Monolith architecture — no separate API server.

## Architecture

- **Single source of truth:** `src/cms/collections.config.ts` defines every collection. From it, the generator produces Drizzle tables, Zod validators, TS types, and admin UI config.
- **Local API, not HTTP-first:** All content operations are plain TypeScript function calls (`cms.posts.find()`, `cms.posts.create()`, etc.). The HTTP layer (`src/pages/api/cms/`) is thin transport for admin islands only.
- **Runtime-rendered admin:** Single catch-all route (`src/pages/admin/[...path].astro`) renders admin views from schema at request time. No generated page files.
- **No plugin system:** CMS runtime lives in `src/cms/core/` as editable project code. Extensions are plain local imports.

## Project Structure

```
src/cms/
├── core/                     ← CMS runtime (editable, no npm dependency)
│   ├── define.ts             ← defineConfig, defineCollection, fields
│   ├── api.ts                ← local API runtime
│   ├── admin.ts              ← admin renderer
│   ├── generator.ts          ← schema → Drizzle/types/Zod compiler
│   ├── richtext.ts           ← RichText component + AST helpers
│   ├── storage.ts            ← file storage adapters
│   └── values.ts             ← value helpers
├── collections.config.ts     ← single source of truth (developer-authored)
├── access.ts                 ← access control rules (developer-authored)
├── hooks.ts                  ← lifecycle hooks (developer-authored)
├── admin/
│   └── views.ts              ← custom list/edit view overrides
└── .generated/               ← auto-generated (DO NOT EDIT)
    ├── schema.ts             ← Drizzle ORM table definitions
    ├── types.ts              ← TypeScript interfaces
    ├── validators.ts         ← Zod schemas
    └── api.ts                ← Typed API wrappers per collection
```

## Key Commands

```bash
pnpm dev                      # generate + start dev server
pnpm build                    # generate + production build
pnpm cms:generate             # regenerate .generated/ from collections.config.ts
npx drizzle-kit generate      # diff schema → migration SQL
npx drizzle-kit migrate       # apply pending migrations
pnpm check                    # type-check (astro check) + lint (eslint)
pnpm format                   # format all files with prettier
pnpm format:check             # check formatting without writing
```

## Validation (IMPORTANT)

After completing any code changes, ALWAYS run these two commands as a final validation step:

1. `pnpm check` — Runs `astro check` (TypeScript) and `eslint` (lint). Fix all errors before considering the task done.
2. `pnpm format --write .` — Run Prettier to format all changed files. This must be the very last step.

## Tech Stack

- **Runtime:** Astro 6+ (SSR, `output: 'server'`)
- **UI framework:** React 19 (islands)
- **ORM:** Drizzle ORM (SQLite dev / Postgres prod)
- **Validation:** Zod
- **Admin UI:** shadcn/ui + Tailwind CSS v4
- **Rich text:** Tiptap/ProseMirror → JSON AST (not HTML, not Markdown)
- **Auth:** Argon2 + session tokens
- **IDs:** nanoid
- **Node:** >=22.12.0
- **Package manager:** pnpm

## Design Rules

1. **One schema, everything generated.** Never duplicate types. Change `collections.config.ts`, run generator, everything updates.
2. **Never edit `.generated/` files.** They are overwritten on every generation.
3. **DB columns use snake_case**, TS fields use camelCase. System fields prefixed with `_` (e.g., `_id`, `_status`, `_createdAt`).
4. **Rich text is JSON AST**, never HTML or Markdown in storage.
5. **Access control** is pure functions in `access.ts`, evaluated by the local API before every operation.
6. **Hooks** in `hooks.ts` run inside the local API, not as external middleware.
7. **Translatable fields** go in `_translations` table; default language stays on main table. Non-translatable fields are never duplicated.
8. **Admin pages are never cached.** Content pages use Astro route caching with tag-based invalidation.
9. **Storage adapters** are composable imports, not plugins.

## Field Types

`text`, `slug`, `email`, `number`, `boolean`, `date`, `select`, `richText`, `image`, `relation`, `array`, `json`, `blocks`

Each field carries metadata for: DB column, Zod validator, TS type, and admin form component.

## Code Style

- TypeScript strict mode
- Path aliases: `@/*` → `./src/*`
- shadcn/ui components in `src/components/ui/`
- Admin components in `src/components/admin/`
- Astro layouts in `src/layouts/`

## Data Flow

```
collections.config.ts
  → .generated/schema.ts   (Drizzle ORM tables)
  → .generated/types.ts    (TS interfaces)
  → .generated/validators.ts (Zod schemas)
  → .generated/api.ts      (local API: find, create, update, delete, publish)
  → admin UI config        (field → component mapping)
  → HTTP transport          (generic route handler for admin islands)
```

## Development Phases (spec reference)

1. Schema + Storage + Local API (core CRUD, generator, Drizzle integration)
2. Admin UI (runtime renderer, shadcn components, field editors, DataTable)
3. Auth + Access Control (sessions, roles, field-level access)
4. Drafts, Publishing, Versions, Cache Invalidation
5. Internationalization (translation tables, locale API, admin language switcher)
6. Agent Polish + Hardening (meta API, introspection, bulk actions)

## Non-Goals (v1)

- GraphQL API
- Multi-tenancy
- Plugin marketplace
- Visual page builder / drag-and-drop layout
- Real-time collaborative editing

# Original spec: Kide CMS — Technical Specification

**Version:** 0.1 (Draft)
**Architecture:** Monolith, code-first, single-schema, AI-native

---

## 1. Design Principles

1. **One schema, everything generated.** A single `collections.config.ts` file defines every collection. From it, the system generates Drizzle ORM tables, Zod validators, TypeScript types, and admin UI configuration. No type duplication.

2. **Monolith-first.** The CMS lives inside the Astro app — same repo, same process, same deployment. No separate API server, no microservices. The admin panel is a set of Astro pages under `/admin`.

3. **Local API, not HTTP-first.** All content operations (CRUD, publish, version) are plain TypeScript function calls imported directly into server code. A thin generic HTTP layer exists to serve the admin's client-side islands, but it's just transport — all logic lives in the local API.

4. **No plugin system, composable imports.** There is no plugin registry, marketplace, or runtime npm dependency. The CMS runtime lives in `src/cms/core/` as editable project code. Extension points — field renderers, hooks, access rules, admin view overrides, storage adapters — are plain local imports. Third-party adapters (e.g., an S3 storage adapter) are standard npm packages that export functions, not plugins that hook into a framework.

5. **AI-agent friendly.** Schemas are introspectable JSON-serializable objects. Operations are importable functions with typed signatures. There is no GUI-only configuration. An agent can read one repo and understand the full system.

6. **Astro-native, not Astro-locked.** Uses Astro pages for admin, Astro components for rendering, Astro actions for mutations. The database layer (Drizzle ORM) is framework-independent so the CMS is not coupled to Astro's infrastructure decisions.

---

## 2. High-Level Architecture

```
astro-project/
├── src/
│   ├── cms/
│   │   ├── core/                    ← CMS runtime (editable project code)
│   │   │   ├── define.ts            ← defineConfig, defineCollection, fields
│   │   │   ├── api.ts               ← local API runtime (find, create, etc.)
│   │   │   ├── admin/               ← admin renderer, field components
│   │   │   │   ├── render.ts        ← renderAdmin()
│   │   │   │   ├── views.ts         ← defineViews()
│   │   │   │   ├── components/ui/   ← shadcn/ui primitives (editable)
│   │   │   │   └── fields/          ← built-in field components
│   │   │   ├── auth.ts              ← session handling
│   │   │   ├── richtext.ts          ← RichText component + AST helpers
│   │   │   └── generator.ts         ← schema → Drizzle/types/Zod compiler
│   │   ├── collections.config.ts    ← single source of truth
│   │   ├── access.ts                ← access control rules
│   │   ├── hooks.ts                 ← lifecycle hooks
│   │   ├── admin/                   ← your customizations
│   │   │   ├── views.ts             ← custom list/edit view overrides
│   │   │   └── fields/              ← custom field components (optional)
│   │   └── .generated/              ← auto-generated (do not edit)
│   │       ├── schema.ts            ← Drizzle table definitions
│   │       ├── types.ts             ← TypeScript interfaces
│   │       ├── validators.ts        ← Zod schemas
│   │       └── api.ts               ← Typed API wrappers per collection
│   ├── pages/
│   │   ├── admin/
│   │   │   └── [...path].astro      ← single catch-all, runtime-rendered
│   │   └── [...slug].astro          ← public content pages
│   └── components/
├── drizzle.config.ts                ← Drizzle Kit configuration
├── astro.config.mjs
└── package.json
```

### Data flow

```
collections.config.ts
        │
        ├──→ .generated/schema.ts   (Drizzle ORM table definitions)
        ├──→ .generated/types.ts    (TS interfaces + Zod schemas)
        ├──→ .generated/api.ts      (local API: find, create, update, delete, publish)
        ├──→ admin UI config         (field → component mapping, list/edit views)
        └──→ HTTP transport        (generic route handler for admin islands)
```

---

## 3. Schema Layer — `collections.config.ts`

This is the only file a developer authors to define content structure. Everything else is derived.

### 3.1 API

```typescript
// src/cms/collections.config.ts
import { defineConfig, defineCollection, fields } from "./core/define";

export default defineConfig({
  database: { dialect: "sqlite" }, // or 'postgres'
  locales: {
    default: "en",
    supported: ["en", "fi", "sv"],
  },
  collections: [
    defineCollection({
      slug: "posts",
      labels: { singular: "Post", plural: "Posts" },
      timestamps: true, // auto createdAt, updatedAt
      drafts: true, // enables draft/published status
      versions: { max: 20 }, // keep last 20 versions

      fields: {
        title: fields.text({
          required: true,
          indexed: true,
          translatable: true,
        }),
        slug: fields.slug({ from: "title", unique: true, translatable: true }),
        excerpt: fields.text({ maxLength: 300, translatable: true }),
        body: fields.richText({ translatable: true }),
        cover: fields.image(),
        category: fields.select({
          options: ["tech", "design", "business"],
        }),
        author: fields.relation({ collection: "users", hasMany: false }),
        tags: fields.array({ of: fields.text() }),
        metadata: fields.json({
          schema: (z) =>
            z.object({
              ogTitle: z.string().optional(),
              ogDescription: z.string().optional(),
            }),
        }),
        sortOrder: fields.number({ defaultValue: 0 }),
      },
    }),

    defineCollection({
      slug: "users",
      labels: { singular: "User", plural: "Users" },
      auth: true, // enables login/session handling
      fields: {
        email: fields.email({ unique: true, required: true }),
        name: fields.text({ required: true }),
        role: fields.select({ options: ["admin", "editor", "viewer"] }),
        avatar: fields.image(),
      },
    }),

    defineCollection({
      slug: "pages",
      labels: { singular: "Page", plural: "Pages" },
      drafts: true,
      fields: {
        title: fields.text({ required: true, translatable: true }),
        slug: fields.slug({ from: "title", unique: true, translatable: true }),
        layout: fields.select({ options: ["default", "landing", "docs"] }),
        blocks: fields.blocks({
          translatable: true,
          types: {
            hero: { heading: fields.text(), cta: fields.text() },
            text: { content: fields.richText() },
            gallery: { images: fields.array({ of: fields.image() }) },
          },
        }),
      },
    }),
  ],
});
```

### 3.2 Field types

| Field      | DB column (Drizzle)                           | Description                          |
| ---------- | --------------------------------------------- | ------------------------------------ |
| `text`     | `text`                                        | Single-line string                   |
| `slug`     | `text` (unique)                               | URL-safe string, auto-generated      |
| `email`    | `text`                                        | Validated email                      |
| `number`   | `integer` / `real`                            | Integer or float                     |
| `boolean`  | `integer` (0/1 SQLite) / `boolean` (Postgres) | True/false                           |
| `date`     | `text` (ISO 8601)                             | Date or datetime                     |
| `select`   | `text`                                        | Enum stored as string                |
| `richText` | `text` (JSON)                                 | JSON AST (not HTML, not Markdown)    |
| `image`    | `text`                                        | Reference to asset ID                |
| `relation` | `text` (FK)                                   | Foreign key to another collection    |
| `array`    | `text` (JSON)                                 | JSON array of typed items            |
| `json`     | `text` (JSON)                                 | Arbitrary validated JSON             |
| `blocks`   | `text` (JSON)                                 | Ordered array of typed block objects |

Every field type carries enough metadata to generate: a DB column, a Zod validator, a TS type, and an admin form component.

Most field types accept `translatable: true`. When set, the field's column appears in the `_translations` table instead of being duplicated. Fields that are structural (relation, image, boolean, number) are typically not translatable. Fields that are linguistic (text, slug, richText, blocks) typically are. The developer decides per field.

### 3.3 Schema compilation

A CLI/build-time step reads `collections.config.ts` and outputs:

```
npm run cms:generate
```

This runs the generator at `src/cms/core/generator.ts`. Add to `package.json`:

```json
{
  "scripts": {
    "cms:generate": "tsx src/cms/core/generator.ts"
  }
}
```

Produces:

- `src/cms/.generated/schema.ts` — Drizzle ORM table definitions
- `src/cms/.generated/types.ts` — TypeScript interfaces per collection
- `src/cms/.generated/validators.ts` — Zod schemas per collection
- `src/cms/.generated/api.ts` — Typed local API functions

Regeneration runs automatically via an Astro integration hook on dev server start and before builds.

---

## 4. Storage Layer — Drizzle ORM

Drizzle ORM provides the database layer. It supports SQLite (via `better-sqlite3`) for local development and Postgres (via `node-postgres`) for production through the same schema definitions.

### 4.1 Why Drizzle, not Astro DB

- **Concurrent writes.** Astro DB is libSQL (SQLite-based) with single-writer limitations. A multi-user CMS needs proper concurrent write handling. Drizzle + Postgres provides this in production; SQLite is fine for solo local dev.
- **Relational integrity.** Drizzle supports real foreign key constraints, cascading deletes, and typed joins. Astro DB's column types lack these.
- **JSON querying.** Postgres `jsonb` with GIN indexes allows efficient queries into `blocks`, `tags`, and `metadata` fields. SQLite's JSON support is minimal.
- **Migrations.** `drizzle-kit` handles schema diffing, migration generation, and execution out of the box. Astro DB has no migration tooling.
- **Independence.** Astro DB's production story couples you to Astro Studio or self-hosted libSQL. Drizzle connects to any standard database.

### 4.2 Table generation

From the `posts` collection, the generator produces:

```typescript
// src/cms/.generated/schema.ts (auto-generated — do not edit)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
// OR for Postgres:
// import { pgTable, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const cmsPosts = sqliteTable("cms_posts", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  body: text("body"), // JSON AST stored as text
  cover: text("cover"), // FK → cms_assets._id
  category: text("category"),
  author: text("author").references(() => cmsUsers._id),
  tags: text("tags"), // JSON array as text
  metadata: text("metadata"), // JSON object as text
  sortOrder: integer("sort_order").default(0),
  _status: text("_status").default("draft").notNull(),
  _createdAt: text("_created_at").notNull(), // ISO 8601
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsPostsVersions = sqliteTable("cms_posts_versions", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id")
    .notNull()
    .references(() => cmsPosts._id),
  _version: integer("_version").notNull(),
  _snapshot: text("_snapshot").notNull(), // full document JSON
  _createdAt: text("_created_at").notNull(),
});

// ... similar for cmsUsers, cmsPages, cmsAssets, cmsSessions
```

The generator emits SQLite dialect by default. A config flag switches to Postgres dialect:

```typescript
// src/cms/collections.config.ts
export default defineConfig({
  database: { dialect: "sqlite" }, // or 'postgres'
  collections: [
    /* ... */
  ],
});
```

### 4.3 Dialect-aware JSON handling

JSON fields (`array`, `json`, `blocks`, `richText`) are stored differently per dialect:

| Dialect  | Storage                     | Querying                                      |
| -------- | --------------------------- | --------------------------------------------- |
| SQLite   | `text` + `JSON()` functions | Basic path extraction, no indexing            |
| Postgres | `jsonb`                     | GIN indexes, `@>` containment, path operators |

The local API abstracts this — `cms.posts.find({ where: { category: 'tech' } })` works the same regardless of dialect. Deep JSON queries (e.g., "find posts containing a `hero` block") are only efficient on Postgres.

### 4.4 Assets table

```typescript
export const cmsAssets = sqliteTable("cms_assets", {
  _id: text("_id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  alt: text("alt"),
  storagePath: text("storage_path").notNull(),
  _createdAt: text("_created_at").notNull(),
});
```

File storage defaults to local disk (`public/uploads/`). A storage adapter interface supports S3, R2, or any other provider via a composable import:

```typescript
// src/cms/collections.config.ts
import { s3Storage } from "@aws-sdk/client-s3"; // or any S3-compatible wrapper

export default defineConfig({
  storage: s3Storage({ bucket: "my-assets", region: "eu-north-1" }),
  // ...
});
```

### 4.5 Drizzle Kit integration

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/cms/.generated/schema.ts",
  out: "./src/cms/migrations",
  dialect: "sqlite", // or 'postgresql'
  dbCredentials: {
    url: "./local.db", // or Postgres connection string
  },
});
```

Migrations are handled by `drizzle-kit`:

```bash
npx drizzle-kit generate   # diff schema → migration SQL
npx drizzle-kit migrate    # apply pending migrations
npx drizzle-kit studio     # visual DB browser (dev)
```

---

## 5. Local API

The primary interface for all content operations. No HTTP overhead. Imported directly into any server-side Astro code.

### 5.1 Generated API

```typescript
// src/cms/.generated/api.ts (auto-generated)
import type { Post, PostInput, User, Page } from './types';

export const cms = {
  posts: {
    find(opts?: FindOptions): Promise<Post[]>,
    findOne(filter: FilterOptions): Promise<Post | null>,
    findById(id: string): Promise<Post | null>,
    create(data: PostInput): Promise<Post>,
    update(id: string, data: Partial<PostInput>): Promise<Post>,
    delete(id: string): Promise<void>,
    publish(id: string): Promise<Post>,
    unpublish(id: string): Promise<Post>,
    count(filter?: FilterOptions): Promise<number>,
    versions(id: string): Promise<Version[]>,
    restore(id: string, versionNumber: number): Promise<Post>,
  },
  users: { /* same shape */ },
  pages: { /* same shape */ },
  assets: {
    upload(file: File): Promise<Asset>,
    delete(id: string): Promise<void>,
    find(opts?: FindOptions): Promise<Asset[]>,
  },
};
```

### 5.2 FindOptions

```typescript
interface FindOptions {
  where?: Record<string, any>; // field-level filters
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
  status?: "draft" | "published" | "any"; // default: 'published'
  locale?: string; // language code; omit for default language
}
```

### 5.3 Usage in Astro pages

```astro
---
// src/pages/blog/[slug].astro
import { cms } from "../../cms/.generated/api";

const post = await cms.posts.findOne({ slug: Astro.params.slug });
if (!post) return Astro.redirect("/404");
---

<article>
  <h1>{post.title}</h1>
  <RichText content={post.body} />
</article>
```

### 5.4 Usage in admin actions

```typescript
// src/pages/admin/posts/actions.ts
import { cms } from "../../../cms/.generated/api";

export async function POST({ request }) {
  const form = await request.formData();
  const post = await cms.posts.create({
    title: form.get("title"),
    body: JSON.parse(form.get("body")),
    category: form.get("category"),
  });
  return new Response(JSON.stringify(post), { status: 201 });
}
```

---

## 6. Hooks

Lifecycle hooks are defined in `src/cms/hooks.ts`. They run inside the local API, not as external middleware.

```typescript
// src/cms/hooks.ts
import { defineHooks } from "./core/define";

export default defineHooks({
  posts: {
    beforeCreate(data, context) {
      // validate, transform, enrich
      return data;
    },
    afterCreate(doc, context) {
      // side effects: send notification, index for search, etc.
    },
    beforeUpdate(data, existing, context) {
      return data;
    },
    afterUpdate(doc, context) {
      // invalidate cached pages that display this post
      context.cache.invalidate({ tags: [`post:${doc._id}`] });
    },
    beforeDelete(doc, context) {},
    afterDelete(doc, context) {
      context.cache.invalidate({ tags: [`post:${doc._id}`, "posts"] });
    },
    beforePublish(doc, context) {
      // final validation gate
      return doc;
    },
    afterPublish(doc, context) {
      // purge the specific post page and any listing pages
      context.cache.invalidate({ tags: [`post:${doc._id}`, "posts"] });
    },
  },
});
```

`context` carries: `{ user, operation, collection, timestamp, cache }`.

---

## 7. Access Control

Defined in `src/cms/access.ts` as pure functions. Evaluated by the local API before every operation.

```typescript
// src/cms/access.ts
import { defineAccess } from "./core/define";

export default defineAccess({
  posts: {
    read: ({ user }) => true, // public
    create: ({ user }) => user?.role === "admin" || user?.role === "editor",
    update: ({ user, doc }) => user?.role === "admin" || doc.author === user?.id,
    delete: ({ user }) => user?.role === "admin",
    publish: ({ user }) => user?.role === "admin",
  },
  users: {
    read: ({ user }) => !!user,
    create: ({ user }) => user?.role === "admin",
    update: ({ user, doc }) => user?.role === "admin" || doc._id === user?.id,
    delete: ({ user }) => user?.role === "admin",
  },
});
```

Field-level access is also supported:

```typescript
fields: {
  role: fields.select({
    options: ['admin', 'editor', 'viewer'],
    access: {
      update: ({ user }) => user?.role === 'admin',  // only admins can change roles
    },
  }),
}
```

---

## 8. Admin UI

The admin is runtime-rendered from the schema — not statically generated into page files. A single Astro catch-all route (`src/pages/admin/[...path].astro`) reads collection config at request time and renders the appropriate view.

### 8.1 Why runtime-rendered, not generated pages

The "generate pages, then own them" model creates a dilemma: when you add a field or collection, either you regenerate and lose customizations, or you don't regenerate and the admin is stale. Runtime rendering solves this — the admin always reflects the current schema.

Customization happens through config objects and component overrides, not by editing generated Astro files.

### 8.2 Architecture

```
src/pages/admin/
└── [...path].astro              ← catch-all route, renders all admin views

src/cms/admin/                   ← customization layer (you own these)
├── views.ts                     ← custom list/edit view config per collection
└── fields/                      ← custom field components
    └── ColorPicker.tsx          ← example custom field
```

The catch-all route does this:

```astro
---
// src/pages/admin/[...path].astro
import { renderAdmin } from "../../cms/core/admin/render";
import config from "../../cms/collections.config";
import views from "../../cms/admin/views";

const { path } = Astro.params;
const html = await renderAdmin({ path, config, views, request: Astro.request });
if (!html) return Astro.redirect("/admin");
---

<Fragment set:html={html} />
```

The `renderAdmin` function resolves the path to a view:

| Path               | View                  |
| ------------------ | --------------------- |
| `/admin`           | Dashboard             |
| `/admin/posts`     | List view for posts   |
| `/admin/posts/:id` | Edit view for posts   |
| `/admin/posts/new` | Create view for posts |
| `/admin/assets`    | Media library         |

### 8.3 View customization

Override list columns, edit layout, or entire views per collection:

```typescript
// src/cms/admin/views.ts
import { defineViews } from "../core/admin/views";

export default defineViews({
  posts: {
    list: {
      columns: ["title", "category", "status", "updatedAt"],
      defaultSort: { field: "updatedAt", direction: "desc" },
      searchableFields: ["title", "excerpt"],
      filters: ["category", "status"],
    },
    edit: {
      layout: [
        { fields: ["title", "slug", "excerpt"], width: "2/3" },
        {
          fields: ["category", "author", "tags", "cover", "status"],
          width: "1/3",
        },
        { fields: ["body"], width: "full" },
      ],
    },
  },
});
```

### 8.4 Field → Component mapping

Each field type maps to a shadcn/ui-based React component, rendered as a client island inside the server-rendered admin page.

| Field type | Admin component      | Built on (shadcn)              |
| ---------- | -------------------- | ------------------------------ |
| `text`     | `<TextInput />`      | `<Input />`                    |
| `slug`     | `<SlugInput />`      | `<Input />` + auto-generate    |
| `email`    | `<EmailInput />`     | `<Input type="email" />`       |
| `number`   | `<NumberInput />`    | `<Input type="number" />`      |
| `boolean`  | `<Toggle />`         | `<Switch />`                   |
| `date`     | `<DatePicker />`     | `<Calendar />` + `<Popover />` |
| `select`   | `<SelectField />`    | `<Select />`                   |
| `richText` | `<RichTextEditor />` | Tiptap + shadcn toolbar        |
| `image`    | `<ImagePicker />`    | `<Dialog />` + media browser   |
| `relation` | `<RelationPicker />` | `<Combobox />` with search     |
| `array`    | `<ArrayField />`     | Sortable list + `<Button />`   |
| `json`     | `<JsonEditor />`     | `<Textarea />` with validation |
| `blocks`   | `<BlockEditor />`    | `<Card />` + drag-and-drop     |

The admin list view uses shadcn's `<DataTable />` (built on TanStack Table), which provides sorting, filtering, pagination, column visibility, and row selection out of the box.

### 8.5 Custom field components

Override any field's admin component by registering it in the collection config:

```tsx
// src/cms/admin/fields/ColorPicker.tsx
export default function ColorPicker({ value, onChange, field }) {
  return <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />;
}
```

```typescript
// in collections.config.ts
color: fields.text({ admin: { component: './admin/fields/ColorPicker' } }),
```

### 8.6 Styling

The admin UI is built on shadcn/ui with Tailwind CSS. Since shadcn components are copied into the project (not installed as a package), they live in `src/cms/core/admin/components/ui/` and are fully editable — consistent with the "everything exposed in code" principle.

Theming uses shadcn's CSS variable system. Override the default theme in your views config:

```typescript
// src/cms/admin/views.ts
export default defineViews({
  theme: {
    // Maps to shadcn CSS variables (--primary, --radius, etc.)
    primaryColor: "hsl(221.2, 83.2%, 53.3%)",
    radius: "0.5rem",
    // or provide a full CSS variable override file
    cssOverrides: "./admin/theme.css",
  },
  // ...
});
```

This gives the admin a professional look with minimal effort while keeping every component inspectable and customizable in the project source.

---

## 9. Rich Text

Rich text is stored as a JSON AST, not HTML or Markdown. This makes it portable, renderable in any context, and easier for agents to manipulate.

### 9.1 Storage format

```json
{
  "type": "root",
  "children": [
    {
      "type": "paragraph",
      "children": [
        { "type": "text", "value": "Hello " },
        { "type": "text", "value": "world", "bold": true }
      ]
    },
    {
      "type": "heading",
      "level": 2,
      "children": [{ "type": "text", "value": "Subheading" }]
    },
    {
      "type": "component-embed",
      "component": "Callout",
      "props": { "type": "warning", "text": "Be careful." }
    }
  ]
}
```

### 9.2 Rendering

A `<RichText />` Astro component walks the AST and renders to HTML, with support for custom node renderers:

```astro
---
import RichText from "../cms/core/richtext/RichText.astro";
import Callout from "../components/Callout.astro";
---

<RichText content={post.body} components={{ Callout }} />
```

### 9.3 Editor

The admin rich text editor is a lightweight block editor (island component). Built on Tiptap/ProseMirror. Outputs the JSON AST directly.

---

## 10. Internationalization (i18n)

Translation is opt-in per field. When `locales` is configured and fields are marked `translatable: true`, the generator creates a parallel translation table for each collection that has translatable fields. Single-language sites pay zero cost — no translation tables are generated if `locales` is omitted.

### 10.1 Architecture: default language on entity, translations in separate table

The default language content lives directly on the main entity table. Other languages go into a `_translations` table. This means:

- `cms.posts.find()` without a locale returns default-language content with no join
- `cms.posts.find({ locale: 'fi' })` joins the translation table and overlays translated fields
- Single-language queries are as fast as a non-i18n system
- Non-translatable fields (category, author, cover, sortOrder) are never duplicated

### 10.2 Generated translation table

From the `posts` collection with `translatable` fields, the generator produces:

```typescript
// In .generated/schema.ts (alongside cmsPosts)
export const cmsPostsTranslations = sqliteTable(
  "cms_posts_translations",
  {
    _id: text("_id").primaryKey(),
    _postId: text("_post_id")
      .notNull()
      .references(() => cmsPosts._id, { onDelete: "cascade" }),
    _languageCode: text("_language_code").notNull(),

    // Only translatable fields appear here
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    body: text("body"), // JSON AST
  },
  (table) => ({
    // One translation per language per document
    uniqueLocale: unique().on(table._postId, table._languageCode),
    // Slug lookup for localized routing
    slugIdx: index("idx_posts_translations_slug").on(table.slug),
  }),
);
```

The pattern is consistent across all collections: the translation table contains the FK, language code, and only the fields marked `translatable`. Everything else stays on the main table.

### 10.3 Local API with locale

The local API gains an optional `locale` parameter:

```typescript
// Default language — no join, fast
const post = await cms.posts.findOne({ slug: "hello-world" });

// Specific locale — joins translation table, overlays translated fields
const post = await cms.posts.findOne({ slug: "hei-maailma", locale: "fi" });

// All translations for a document
const translations = await cms.posts.getTranslations(postId);
// → { en: { title, slug, excerpt, body }, fi: { title, slug, excerpt, body } }

// Create/update a translation
await cms.posts.upsertTranslation(postId, "fi", {
  title: "Hei maailma",
  slug: "hei-maailma",
  excerpt: "Tervetuloa...",
  body: {
    /* JSON AST */
  },
});
```

When `locale` is passed, the API:

1. Queries the main table for non-translatable fields
2. Left-joins the translation table for the requested language
3. Falls back to default-language values for any missing translated fields

### 10.4 Admin UI

When `locales` is configured, the admin edit view shows a language switcher. Editors select a language and edit the translatable fields for that locale. Non-translatable fields (category, author, cover) appear once and are shared across all languages.

The list view shows content in the default language. A column indicates which translations exist for each document (e.g., "en, fi" or "en only").

### 10.5 Localized routing

For content pages with translatable slugs, the developer structures routes to include the locale:

```astro
---
// src/pages/[locale]/blog/[slug].astro
const { locale, slug } = Astro.params;
const post = await cms.posts.findOne({ slug, locale });
if (!post) return Astro.redirect("/404");

Astro.cache.set({
  maxAge: 3600,
  tags: ["posts", `post:${post._id}`, `locale:${locale}`],
});
---
```

Cache tags include the locale so that updating a Finnish translation only invalidates Finnish cached pages, not the English ones.

### 10.6 Upsert pattern

Translation writes use `ON CONFLICT (entity_id, language_code) DO UPDATE`, so creating a translation for a language that already exists updates it in place. This maps directly to Drizzle's `.onConflictDoUpdate()`:

```typescript
await db
  .insert(cmsPostsTranslations)
  .values({ _postId: id, _languageCode: locale, title, slug, excerpt, body })
  .onConflictDoUpdate({
    target: [cmsPostsTranslations._postId, cmsPostsTranslations._languageCode],
    set: { title, slug, excerpt, body },
  });
```

### 10.7 What is NOT translatable

Some things are shared across all languages by design:

- Relations (author, category) — the relationship is the same regardless of language
- Status (draft/published) — a document is published or not, not per-language
- Timestamps, sort order, metadata — structural, not linguistic
- Images — the file is the same; only `alt` text can be translatable (via the assets translation table)

This keeps the model simple: translatable fields are content, non-translatable fields are structure.

---

## 11. HTTP API (Internal Transport)

The admin UI's interactive islands (Tiptap editor, image picker, relation selector, block editor) need to talk to the server. Rather than building bespoke action endpoints for each interaction, the CMS generates a thin generic HTTP layer over the local API — one parameterized route handler that maps standard HTTP methods to local API calls.

### 11.1 Why generic, not bespoke

The admin needs: list documents, get one, create, update, delete, publish, search relations, upload assets. Those are exactly the local API operations. Building separate action endpoints for each (`cms/actions/save`, `cms/actions/list`, `cms/actions/search-relations`) just reinvents a generic CRUD interface with inconsistent naming and more code. A single route handler parameterized by collection is simpler.

### 11.2 Route handler

The entire HTTP layer is one auto-generated file — roughly 60 lines:

```typescript
// src/pages/api/cms/[collection]/[...path].ts (auto-generated)
import { cms } from "../../../cms/.generated/api";
import { getUser } from "../../../cms/auth";

export async function GET({ params, request, url }) {
  const user = await getUser(request);
  const { collection, path } = params;
  const id = path?.[0];

  if (id) {
    const doc = await cms[collection].findById(id, { user });
    return Response.json(doc);
  }

  const query = Object.fromEntries(url.searchParams);
  const docs = await cms[collection].find(
    {
      where: query.where ? JSON.parse(query.where) : undefined,
      sort: query.sort ? JSON.parse(query.sort) : undefined,
      limit: query.limit ? Number(query.limit) : 20,
      offset: query.offset ? Number(query.offset) : 0,
    },
    { user },
  );
  return Response.json(docs);
}

export async function POST({ params, request }) {
  const user = await getUser(request);
  const { collection, path } = params;
  const action = path?.[1]; // e.g., "publish"

  if (action === "publish") {
    const doc = await cms[collection].publish(path[0], { user });
    return Response.json(doc);
  }
  if (action === "unpublish") {
    const doc = await cms[collection].unpublish(path[0], { user });
    return Response.json(doc);
  }

  const data = await request.json();
  const doc = await cms[collection].create(data, { user });
  return Response.json(doc, { status: 201 });
}

export async function PATCH({ params, request }) {
  const user = await getUser(request);
  const data = await request.json();
  const doc = await cms[params.collection].update(params.path[0], data, {
    user,
  });
  return Response.json(doc);
}

export async function DELETE({ params, request }) {
  const user = await getUser(request);
  await cms[params.collection].delete(params.path[0], { user });
  return new Response(null, { status: 204 });
}
```

Plus a dedicated asset upload endpoint:

```typescript
// src/pages/api/cms/assets/upload.ts
export async function POST({ request }) {
  const user = await getUser(request);
  const formData = await request.formData();
  const file = formData.get("file");
  const asset = await cms.assets.upload(file, { user });
  return Response.json(asset, { status: 201 });
}
```

### 11.3 What this gives you

| Route                          | Method   | Operation   |
| ------------------------------ | -------- | ----------- |
| `/api/cms/posts`               | `GET`    | List/search |
| `/api/cms/posts/:id`           | `GET`    | Get by ID   |
| `/api/cms/posts`               | `POST`   | Create      |
| `/api/cms/posts/:id`           | `PATCH`  | Update      |
| `/api/cms/posts/:id`           | `DELETE` | Delete      |
| `/api/cms/posts/:id/publish`   | `POST`   | Publish     |
| `/api/cms/posts/:id/unpublish` | `POST`   | Unpublish   |
| `/api/cms/assets/upload`       | `POST`   | Upload file |

All validation and access control happen inside the local API — the HTTP layer does nothing except deserialize the request and serialize the response.

### 11.4 Internal-first, externally useful later

This API exists to serve the admin. It is not documented as a public interface, not versioned, and sits behind session auth. But because it follows standard conventions, it becomes externally useful with minimal effort if that need arises later — swap session auth for bearer tokens and it's a headless API. That's a free option, not an upfront cost.

---

## 12. Authentication

When a collection has `auth: true`, the CMS generates session-based auth:

- Password hashing (argon2)
- Session tokens stored in `cms_sessions` table
- Login/logout endpoints
- Middleware that attaches `context.user` to Astro requests
- Admin pages check `context.user` before rendering

No external auth provider required for the default case. An adapter interface allows plugging in OAuth/OIDC if needed later.

---

## 13. Rendering & Caching Strategy

CMS-managed pages are server-rendered (SSR) and cached using Astro 6's experimental route caching API. This gives static-site speed with instant content updates — no full rebuilds, no stale pages.

### 13.1 Why not SSG, why not pure SSR

Static generation (SSG) requires a full rebuild after every content change. For a CMS with editors making frequent updates, that's unacceptable. Pure SSR renders every request from scratch, which is slow and expensive under traffic. Route caching gives you both: pages render once, get cached, and serve at static speed until explicitly invalidated.

### 13.2 Astro config

The project runs in `server` output mode with route caching enabled:

```typescript
// astro.config.mjs
import { defineConfig, memoryCache } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  experimental: {
    cache: {
      provider: memoryCache(), // swap for CDN provider in production
    },
    routeRules: {
      "/blog/*": { maxAge: 3600, swr: 300, tags: ["posts"] },
      "/pages/*": { maxAge: 7200, swr: 600, tags: ["pages"] },
      "/admin/*": false, // never cache admin
      "/api/*": false, // never cache API
    },
  },
});
```

`routeRules` set defaults for entire route groups. Individual pages can override or extend these.

### 13.3 Per-page cache tagging

Each content page tags its cache response with the specific document ID. This enables surgical invalidation — when a single post changes, only pages displaying that post are purged.

```astro
---
// src/pages/blog/[slug].astro
import { cms } from "../../cms/.generated/api";

const post = await cms.posts.findOne({ slug: Astro.params.slug });
if (!post) return Astro.redirect("/404");

Astro.cache.set({
  maxAge: 3600, // fresh for 1 hour
  swr: 300, // serve stale 5 min while revalidating
  tags: ["posts", `post:${post._id}`], // granular invalidation targets
});
---

<article>
  <h1>{post.title}</h1>
  <RichText content={post.body} />
</article>
```

Listing pages tag by collection:

```astro
---
// src/pages/blog/index.astro
const posts = await cms.posts.find({ status: "published", limit: 20 });

Astro.cache.set({
  maxAge: 1800,
  swr: 300,
  tags: ["posts"], // invalidated when any post changes
});
---
```

### 13.4 Cache invalidation from CMS hooks

The CMS hooks system (section 6) wires cache invalidation to content lifecycle events. When content changes, the relevant hooks call `context.cache.invalidate()`:

```typescript
// In hooks.ts
afterPublish(doc, context) {
  // purge the specific post page + any listing pages
  context.cache.invalidate({ tags: [`post:${doc._id}`, 'posts'] });
},
afterUpdate(doc, context) {
  context.cache.invalidate({ tags: [`post:${doc._id}`] });
},
afterDelete(doc, context) {
  context.cache.invalidate({ tags: [`post:${doc._id}`, 'posts'] });
},
```

This means: editor publishes a post → `afterPublish` fires → cache tags get purged → next visitor request renders a fresh page → that page gets cached again. The loop is fully automatic.

### 13.5 How it works per deployment target

The route caching API is platform-agnostic. The `provider` in the Astro config determines where caching actually happens:

| Deployment            | Provider                          | How it works                                   |
| --------------------- | --------------------------------- | ---------------------------------------------- |
| Node.js (self-hosted) | `memoryCache()`                   | In-process LRU cache, good for single-instance |
| Vercel                | Vercel adapter cache provider     | Translates to `CDN-Cache-Control` headers      |
| Netlify               | Netlify adapter cache provider    | Uses `Cache-Tag` headers + purge API           |
| Cloudflare            | Cloudflare adapter cache provider | Uses Cache API / KV                            |

Same `Astro.cache.set()` calls in your page code, different infrastructure underneath. No code changes when switching hosts.

### 13.6 Admin pages are never cached

The admin (`/admin/*`) is excluded from caching via `routeRules`. Every admin request hits the server directly, which is correct — the admin always needs fresh data and authenticated responses. The cache only applies to public-facing content pages.

---

## 14. AI Agent Interface

The CMS is designed so that an AI agent operating on the codebase can perform any content or schema operation without GUI interaction.

### 14.1 What an agent can do

| Operation                     | How                                                  |
| ----------------------------- | ---------------------------------------------------- |
| Inspect all collections       | Read `collections.config.ts`                         |
| Inspect a collection's fields | Read the `fields` object for that collection         |
| Create a new collection       | Add a `defineCollection()` call, run generate        |
| Add a field                   | Add to `fields`, run generate                        |
| Create content                | Import `cms` and call `cms.posts.create()`           |
| Bulk update content           | Loop over `cms.posts.find()` + `.update()`           |
| Validate content              | Import validators from `.generated/validators`       |
| Read access rules             | Read `access.ts`                                     |
| Modify hooks                  | Edit `hooks.ts`                                      |
| Scaffold admin views          | Edit `src/cms/admin/views.ts`                        |
| Invalidate cached pages       | Call `cache.invalidate({ tags })` or edit `hooks.ts` |
| Create/update translations    | Call `cms.posts.upsertTranslation(id, locale, data)` |
| Read all translations         | Call `cms.posts.getTranslations(id)`                 |

### 14.2 Agent-friendly conventions

- All schemas are plain TypeScript objects (no decorators, no magic strings).
- All operations are importable functions with full type signatures.
- No hidden state — config is in files, content is in DB, both are readable.
- Generated code is clearly marked (`// auto-generated — do not edit`).
- A `cms.meta` namespace exposes runtime schema introspection:

```typescript
cms.meta.getCollections(); // → ['posts', 'users', 'pages']
cms.meta.getFields("posts"); // → { title: { type: 'text', ... }, ... }
cms.meta.getSchema("posts"); // → Zod schema object
```

---

## 15. Project Structure Summary

```
src/cms/
├── core/                     ← CMS RUNTIME (editable, no npm dependency)
│   ├── define.ts             ← defineConfig, defineCollection, fields, etc.
│   ├── api.ts                ← local API runtime
│   ├── admin/                ← admin renderer + shadcn/ui components + field components
│   ├── auth.ts               ← session handling
│   ├── richtext/             ← RichText component + AST helpers
│   └── generator.ts          ← schema compiler
├── collections.config.ts     ← YOU WRITE THIS (single source of truth)
├── access.ts                 ← YOU WRITE THIS (access rules)
├── hooks.ts                  ← YOU WRITE THIS (lifecycle hooks)
├── admin/
│   ├── views.ts              ← YOU WRITE THIS (optional view customization)
│   └── fields/               ← YOU WRITE THIS (optional custom field components)
└── .generated/               ← AUTO-GENERATED (do not edit)
    ├── schema.ts             ← Drizzle ORM table definitions
    ├── types.ts              ← TypeScript interfaces
    ├── validators.ts         ← Zod schemas
    └── api.ts                ← Typed API wrappers per collection

src/pages/admin/
└── [...path].astro           ← Single catch-all (runtime-rendered from schema)

drizzle.config.ts             ← Database connection config
```

Three files to author (`collections.config.ts`, `access.ts`, `hooks.ts`). The `core/` directory is the CMS runtime — it ships with the project and is fully readable and editable. Everything in `.generated/` is derived.

---

## 16. Development Plan

### Phase 1 — Schema + Storage + Local API (weeks 1–3)

Deliverables:

- `defineCollection` / `defineConfig` / `fields.*` API
- Code generator: `collections.config.ts` → Drizzle schema + types + Zod + local API
- Drizzle Kit integration (migration generation and execution)
- Core local API implementation (CRUD, find, count)
- SQLite local dev setup, Postgres production path
- Astro integration hook for auto-regeneration on config file save
- Base Astro config: `output: 'server'`, route caching with `memoryCache()`
- Tests: schema compilation, CRUD operations, type correctness

Exit criteria: a developer can define collections in one file and perform typed CRUD from Astro server code, with migrations handled by `drizzle-kit`. The app runs in SSR mode with route caching enabled.

### Phase 2 — Admin UI (weeks 4–7)

Deliverables:

- Runtime admin renderer (`renderAdmin` + catch-all route)
- shadcn/ui component library setup (copied into `src/cms/core/admin/components/ui/`)
- DataTable-based list view (TanStack Table: sort, filter, paginate, select)
- Field component library built on shadcn primitives (all basic types)
- Rich text editor integration (Tiptap island, JSON AST output)
- Image upload + asset management view
- Relation picker component (combobox with search)
- Block editor for `blocks` field type
- View customization API (`defineViews`)
- Tailwind + shadcn CSS variable theming

Exit criteria: a non-developer can log in, create/edit/delete content through the admin. Adding a new collection to config instantly reflects in the admin with no regeneration.

### Phase 3 — Auth + Access Control (weeks 8–9)

Deliverables:

- `auth: true` collection support (sessions, password hashing)
- Login/logout flow
- Access control evaluation in local API
- Field-level access
- Admin middleware (redirect to login if unauthenticated)

Exit criteria: multi-user editing with role-based permissions works end to end.

### Phase 4 — Drafts, Publishing, Versions, Cache Invalidation (weeks 10–11)

Deliverables:

- Draft/published status lifecycle
- `publish()` / `unpublish()` operations
- Version snapshots on every save
- Version history UI in admin
- Restore from version
- `cache` object in hook context for invalidation
- Default `routeRules` generation from collection config
- Auto-tagging of content pages with collection and document tags
- Cache invalidation wired to `afterPublish`, `afterUpdate`, `afterDelete` hooks

Exit criteria: editors can draft, publish, and roll back content. Publishing or updating a document automatically invalidates the relevant cached pages.

### Phase 5 — Internationalization (weeks 12–13)

Deliverables:

- `locales` config support in `defineConfig`
- `translatable: true` flag on field definitions
- Translation table generation (`_translations` table per collection with translatable fields)
- `locale` parameter in local API (`find`, `findOne`)
- `getTranslations()` and `upsertTranslation()` API methods
- Upsert pattern with `ON CONFLICT (entity_id, language_code) DO UPDATE`
- Admin language switcher in edit view
- Translation status indicators in list view
- Locale-aware cache tagging (`locale:fi` tags)

Exit criteria: editors can create and manage translations through the admin. Pages can query content by locale. Cache invalidation is locale-aware.

### Phase 6 — Agent Polish + Hardening (weeks 14–15)

Deliverables:

- `cms.meta` introspection API
- Agent workflow tests (create collection, add fields, CRUD content via code)
- Admin UI polish (search, filters, bulk actions)
- Error handling and validation feedback
- README and getting-started guide

Exit criteria: an AI agent can scaffold a full content site from an empty project using only the CMS APIs.

---

## 17. Technology Choices

| Concern           | Choice                             | Rationale                                                          |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Runtime           | Astro 6+                           | SSR, actions, route caching, content-first                         |
| Caching           | Astro route caching (experimental) | Platform-agnostic ISR, tag-based invalidation                      |
| ORM               | Drizzle ORM                        | Type-safe, multi-dialect, excellent migrations                     |
| Database (dev)    | SQLite (`better-sqlite3`)          | Zero-config local development                                      |
| Database (prod)   | PostgreSQL                         | Concurrency, jsonb, relational integrity                           |
| Validation        | Zod                                | Astro's standard, composable, serializable                         |
| Rich text editor  | Tiptap (ProseMirror)               | JSON output, extensible, mature                                    |
| Rich text storage | JSON AST                           | Portable, agent-parseable, component embeds                        |
| Admin UI          | shadcn/ui + Tailwind CSS           | Production-grade components, data tables, theming, editable source |
| Auth              | Argon2 + session tokens            | Simple, no external dependency                                     |
| ID generation     | nanoid                             | Short, URL-safe, collision-resistant                               |
| Image processing  | Sharp (optional)                   | Resizing, format conversion on upload                              |
| File storage      | Local disk (default)               | Adapter interface for S3/R2 via imports                            |
| Migrations        | drizzle-kit                        | Schema diffing, SQL generation, proven tooling                     |

---

## 18. Migration Strategy

When `collections.config.ts` changes (field added, renamed, removed):

1. `npm run cms:generate` regenerates the Drizzle schema in `.generated/schema.ts`.
2. `npx drizzle-kit generate` diffs the new schema against the current DB and produces a migration SQL file in `src/cms/migrations/`.
3. Developer reviews the migration and runs `npx drizzle-kit migrate` to apply it.
4. For destructive changes (drop column, rename), drizzle-kit flags them and requires manual confirmation in the migration file.

The two-step flow can be combined into a single npm script:

```bash
npm run cms:migrate   # runs cms:generate + drizzle-kit generate + drizzle-kit migrate
```

```json
{
  "scripts": {
    "cms:generate": "tsx src/cms/core/generator.ts",
    "cms:migrate": "npm run cms:generate && npx drizzle-kit generate && npx drizzle-kit migrate"
  }
}
```

Migrations are plain SQL files — inspectable, version-controlled, agent-readable. Drizzle Kit also provides `drizzle-kit studio` for visual DB inspection during development.

---

## 19. Constraints and Non-Goals

**Not goals for v1:**

- GraphQL API
- Multi-tenancy
- Plugin marketplace or plugin resolution system
- Framework-agnostic usage (Astro-first, but DB layer is portable)
- Visual page builder / drag-and-drop layout
- Real-time collaborative editing
- Astro live collection integration (local API is the content interface)

**Hard constraints:**

- Astro 6+ only
- Node.js 20+
- Drizzle ORM (SQLite or PostgreSQL)
- `output: 'server'` mode — CMS content pages require on-demand rendering; non-CMS pages can opt into prerendering with `export const prerender = true`
- Server-rendered admin (no SPA)
