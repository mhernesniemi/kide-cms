---
title: Webhooks
description: Notify external services when content changes.
---

Webhooks let you POST to external URLs when content events happen: publishing posts, updating documents, deleting items, and so on. Use them to trigger deploys, sync to search indexes, post Slack notifications, or call any other HTTP endpoint.

## Configuration

Add `webhooks` to the `admin` section of your CMS config:

```typescript
import { defineConfig } from "@kidecms/core";

export default defineConfig({
  admin: {
    webhooks: [
      {
        name: "Slack notify",
        url: "https://hooks.slack.com/services/xxx/yyy/zzz",
        events: ["publish"],
        collections: ["posts"],
        payload: (doc, context) => ({
          text: `📝 ${doc.title} published by ${context.user?.email}`,
        }),
      },
    ],
  },
  collections: [...],
});
```

## Options

| Option        | Type                         | Description                                                                    |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `name`        | `string`                     | Display name (used in logs)                                                    |
| `url`         | `string`                     | URL to send the request to                                                     |
| `events`      | `WebhookEvent[]`             | One or more of `"create"`, `"update"`, `"delete"`, `"publish"`, `"unpublish"`  |
| `collections` | `string[]`                   | Restrict to specific collection slugs (omit to fire on all collections)        |
| `method`      | `"POST" \| "PUT" \| "PATCH"` | HTTP method (default: `POST`)                                                  |
| `headers`     | `Record<string, string>`     | Custom headers (e.g. `Authorization`)                                          |
| `payload`     | `(doc, context) => any`      | Transform the payload (default: `{ event, collection, doc, user, timestamp }`) |

## Default payload

If you don't define `payload`, the webhook receives this JSON body:

```json
{
  "event": "publish",
  "collection": "posts",
  "doc": { "_id": "...", "title": "Hello World", "...": "..." },
  "user": { "id": "...", "email": "editor@example.com", "role": "editor" },
  "timestamp": "2026-04-09T12:34:56.789Z"
}
```

## Custom payloads

Pass a `payload` function to shape the request body for the receiving service:

```typescript
{
  name: "Discord notify",
  url: "https://discord.com/api/webhooks/xxx/yyy",
  events: ["publish"],
  payload: (doc, context) => ({
    embeds: [
      {
        title: `New post: ${doc.title}`,
        description: doc.excerpt,
        color: 5814783,
        footer: { text: `by ${context.user?.email}` },
      },
    ],
  }),
}
```

## Authentication

Use the `headers` option to add Bearer tokens or API keys:

```typescript
{
  name: "Internal CMS sync",
  url: "https://internal.example.com/api/webhook",
  events: ["create", "update", "delete"],
  headers: {
    Authorization: `Bearer ${process.env.WEBHOOK_TOKEN}`,
  },
}
```

## Reliability

Webhooks are **fire-and-forget** — they don't block the operation that triggered them. If a delivery fails, Kide retries up to 3 times with exponential backoff (1s, 3s, 9s). Failed deliveries are logged to the server console.

| Failure mode            | Behavior                                               |
| ----------------------- | ------------------------------------------------------ |
| Non-2xx response        | Retry up to 3 times, then log permanent failure        |
| Network error           | Retry up to 3 times, then log permanent failure        |
| Timeout (5s)            | Retry up to 3 times, then log permanent failure        |
| Webhook callback throws | Caught and logged, doesn't affect the parent operation |

## Hooks vs webhooks

Both can react to content events. Use webhooks when:

- You're calling an external HTTP service
- The same logic applies to multiple collections
- You want built-in retries, timeouts, and error logging
- You want to enable/disable integrations by editing config

Use [collection hooks](/hooks/) when:

- The logic isn't an HTTP call (writing files, querying other DBs, mutating documents)
- You need to transform data before save
- The behavior is specific to one collection and complex enough to warrant custom code
