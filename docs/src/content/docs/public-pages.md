---
title: Public Pages
description: Rendering CMS content on your site.
---

Public pages are standard Astro pages that fetch content from the local API.

## Basic page

```astro
---
import { cms } from "@/cms/.generated/api";
import { cacheTags } from "@kide/core";

const isPreview = Astro.url.searchParams.has("preview");
const doc = await cms.posts.findOne({ slug: Astro.params.slug!, status: isPreview ? "any" : "published" });
if (!doc) return Astro.redirect("/404");
if (!isPreview) Astro.cache.set({ tags: cacheTags("posts", doc._id) });
---

<h1>{doc.title}</h1>
<p>{doc.excerpt}</p>
```

### What `cacheTags` does

Generates cache tag arrays for Astro's route caching. When content changes, hooks invalidate these tags automatically.

```typescript
cacheTags("posts", doc._id);
// -> ["posts", "post:abc123"]
```

## Route structure

The recommended structure separates each content type into its own route file:

```
src/pages/
  index.astro              # home page
  blog/[slug].astro        # posts
  [...slug].astro           # pages (catch-all)
```

### Post page

```astro
---
// src/pages/blog/[slug].astro
import PublicLayout from "@/layouts/PublicLayout.astro";
import RichTextContent from "@/components/RichTextContent.astro";
import { cms } from "@/cms/.generated/api";
import { cacheTags } from "@kide/core";
import { cmsImage, cmsSrcset } from "@kide/core";

const isPreview = Astro.url.searchParams.has("preview");
const doc = await cms.posts.findOne({ slug: Astro.params.slug!, status: isPreview ? "any" : "published" });
if (!doc) return Astro.redirect("/");
if (!isPreview) Astro.cache.set({ tags: cacheTags("posts", doc._id) });
---

<PublicLayout title={doc.title}>
  <h1>{doc.title}</h1>
  {
    doc.image && (
      <img
        src={cmsImage(doc.image, 1024)}
        srcset={cmsSrcset(doc.image)}
        sizes="(max-width: 640px) 100vw, 640px"
        alt={doc.title}
      />
    )
  }
  {doc.excerpt && <p>{doc.excerpt}</p>}
  <RichTextContent content={doc.body} />
</PublicLayout>
```

### Page with blocks

```astro
---
// src/pages/[...slug].astro
import PublicLayout from "@/layouts/PublicLayout.astro";
import BlockRenderer from "@/components/BlockRenderer.astro";
import { cms } from "@/cms/.generated/api";
import { cacheTags, parseBlocks } from "@kide/core";

const isPreview = Astro.url.searchParams.has("preview");
const doc = await cms.pages.findOne({ slug: Astro.params.slug!, status: isPreview ? "any" : "published" });
if (!doc) return Astro.redirect("/");
if (!isPreview) Astro.cache.set({ tags: cacheTags("pages", doc._id) });

const blocks = parseBlocks(doc.blocks);
---

<PublicLayout title={doc.title}>
  <h1>{doc.title}</h1>
  {doc.summary && <p>{doc.summary}</p>}
  <BlockRenderer blocks={blocks} />
</PublicLayout>
```

## Querying the local API

All content queries go through the typed local API. This gives you full type safety and access to all query options.

```astro
---
import { cms } from "@/cms/.generated/api";

// List published posts
const posts = await cms.posts.find({
  status: "published",
  sort: { field: "_createdAt", direction: "desc" },
  limit: 10,
});

// Find by slug
const post = await cms.posts.findOne({ slug: "hello-world" });

// Find by ID
const post = await cms.posts.findById("abc123");
---
```

See [Local API](/local-api/) for the full query API.

## Blocks

`<BlockRenderer>` renders blocks automatically. Each block type maps to an Astro component in `src/components/blocks/`:

```
src/components/blocks/
  Hero.astro      <- renders "hero" blocks
  Text.astro      <- renders "text" blocks
  Faq.astro       <- renders "faq" blocks
  Image.astro     <- renders "image" blocks
```

The component name maps to the block type (PascalCase -> camelCase). Block fields are passed as props.

### Custom block component

```astro
---
// src/components/blocks/Hero.astro
const { eyebrow, heading, body, ctaLabel, ctaHref } = Astro.props;
---

<section>
  {eyebrow && <p>{eyebrow}</p>}
  <h2>{heading}</h2>
  {body && <p>{body}</p>}
  {ctaLabel && ctaHref && <a href={ctaHref}>{ctaLabel}</a>}
</section>
```

For fields that store JSON arrays (repeaters, image lists), use the `parseList` helper:

```astro
---
import { parseList } from "@kide/core";

const { heading, items: rawItems } = Astro.props;
const items = parseList<{ title?: string; description?: string }>(rawItems);
---

<h2>{heading}</h2>
{
  items.map((item) => (
    <div>
      <p>{item.title}</p>
      <p>{item.description}</p>
    </div>
  ))
}
```

Block types without a matching component are rendered generically -- no code needed for basic blocks.

## Images

Use `cmsImage` and `cmsSrcset` for optimized images:

```astro
---
import { cmsImage, cmsSrcset } from "@kide/core";
---

<!-- Single optimized image -->
<img src={cmsImage(doc.image, 800)} alt={doc.title} />

<!-- Responsive with srcset -->
<img
  src={cmsImage(doc.image, 1024)}
  srcset={cmsSrcset(doc.image)}
  sizes="(max-width: 640px) 100vw, 640px"
  alt={doc.title}
/>
```

Images are transformed on-demand (Sharp) and cached to disk. See [Assets](/assets/#image-optimization) for details.

## Caching

Content pages use Astro's route caching with tag-based invalidation. When you save or publish content in the admin, lifecycle hooks automatically invalidate the relevant cache tags.

```astro
---
// Cache this page, tagged with the collection and document ID
if (!isPreview) {
  Astro.cache.set({ tags: cacheTags("posts", doc._id) });
}
---
```

Preview requests (`?preview=true`) skip caching so editors always see the latest saved content.
