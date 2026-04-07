---
title: Authentication
description: Session-based auth for the admin.
---

## How It Works

- Passwords hashed with PBKDF2 (Web Crypto API)
- Session tokens stored in `cms_sessions` table
- HttpOnly cookies with SameSite=Lax (+ Secure in production)
- 30-day session expiry with server-side validation

## Setup

On first run with no users, visiting `/admin` redirects to `/admin/setup` where you create the initial admin account.

## Inviting Users

After the initial admin account is created, new users are added through the invite flow:

1. **Admin creates a user** at `/admin/users/new` with an email and role.
2. **System generates a one-time invite token** with a 7-day expiry.
3. **Invite is delivered:**
   - If the `RESEND_API_KEY` env var is set, an invite email is sent automatically via [Resend](https://resend.com).
   - If not set, a copyable invite link is shown in the admin UI for the admin to share manually.
4. **New user opens** `/admin/invite?token=xxx` and sets their name and password.
5. **Token is consumed** after use and cannot be reused.

## Environment Variables

```
RESEND_API_KEY=         # Optional - enables automatic invite emails
RESEND_FROM_EMAIL=      # Optional - sender address (default: Kide CMS <noreply@example.com>)
```

## Auth Collection

Any collection with `auth: true` enables login:

```typescript
defineCollection({
  slug: "users",
  labels: { singular: "User", plural: "Users" },
  auth: true,
  fields: {
    email: fields.email({ required: true, unique: true }),
    name: fields.text({ required: true }),
    role: fields.select({ options: ["admin", "editor", "viewer"] }),
    password: fields.text({ admin: { hidden: true } }),
  },
});
```

The `password` field is automatically hashed on create/update. Use `admin: { hidden: true }` to hide it from the edit form.

## Middleware

The middleware in `src/middleware.ts` protects all `/admin` and `/api/cms` routes. Public pages are unaffected.

## Roles

Roles are plain strings stored on the user document. Access rules defined in each collection config use them to gate operations. There's no built-in role hierarchy. You define what each role can do. See [Access Control](/access-control/) for details.
