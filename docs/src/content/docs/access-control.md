---
title: Access Control
description: Role-based permissions for collections and fields.
---

Access rules are defined directly in each collection config file using helper functions. Rules are pure functions evaluated before every API operation. Any operation without a rule is allowed by default.

```typescript
import { defineCollection, fields, hasRole } from "@kide/core";

export default defineCollection({
  slug: "posts",
  access: {
    create: hasRole("admin", "editor"),
    update: hasRole("admin", "editor"),
    delete: hasRole("admin"),
    publish: hasRole("admin", "editor"),
  },
  fields: { ... },
});
```

In this example, `read` is not set so anyone can read posts. Only the operations you want to restrict need a rule.

## Helper Functions

| Helper                       | Description                           |
| ---------------------------- | ------------------------------------- |
| `hasRole("admin")`           | Checks if user has the specified role |
| `hasRole("admin", "editor")` | Accepts multiple roles (OR logic)     |

> `access.ts` still exists but is auto-built from collection configs. You should not edit it directly.

## Operations

| Operation  | When checked                              |
| ---------- | ----------------------------------------- |
| `read`     | `find`, `findOne`, `findById`             |
| `create`   | `create`                                  |
| `update`   | `update`                                  |
| `delete`   | `delete`                                  |
| `publish`  | `publish`, `unpublish`                    |
| `schedule` | `schedule` (falls back to `publish` rule) |

## Context

```typescript
({ user, doc, operation, collection }) => boolean;
```

- `user` - current session user (`{ id, role, email }` or `null`)
- `doc` - existing document (for update/delete/publish)
- `operation` - operation name
- `collection` - collection slug

## Field-Level Access

Individual fields support `read` and `update` access rules:

```typescript
summary: fields.text({
  access: {
    read: hasRole("admin"),     // hidden from non-admins
    update: hasRole("admin"),   // read-only for non-admins
  },
}),
```

- `read` hides the field entirely from the admin UI
- `update` makes the field read-only in the admin UI; values are silently preserved on save
