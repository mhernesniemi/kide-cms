---
title: Assets
description: File uploads and media management.
---

## Media Library

The admin includes a media library at `/admin/assets` with:

- Grid view with thumbnails
- Folder organization (create, rename, delete, drag-to-move)
- Upload via button or drag-and-drop
- Alt text editing
- Focal point selector (click image to set crop center)

## Image Fields

Image fields render an upload button and a browse dialog that connects to the media library. The stored value is the file URL (`/uploads/filename.ext`).

## Storage

Asset metadata (filename, mime type, size, alt, focal point) is stored in the `cms_assets` table. File storage depends on the deployment target:

- **Local/Node.js**: Files stored in `public/uploads/`, served by Astro's static file handling
- **Cloudflare**: Files stored in R2 via the `CMS_ASSETS` bucket binding, served by a dynamic route

The CMS uses a storage abstraction (`src/cms/core/storage.ts`) with `putFile`, `getFile`, `deleteFile` functions. The setup script configures the correct implementation for your deployment target.

## API

| Method   | Endpoint                 | Description                       |
| -------- | ------------------------ | --------------------------------- |
| `POST`   | `/api/cms/assets/upload` | Upload file (multipart/form-data) |
| `GET`    | `/api/cms/assets`        | List assets                       |
| `GET`    | `/api/cms/assets/:id`    | Get single asset                  |
| `PATCH`  | `/api/cms/assets/:id`    | Update metadata                   |
| `DELETE` | `/api/cms/assets/:id`    | Delete asset and file             |

### List parameters

| Param    | Type     | Description                                 |
| -------- | -------- | ------------------------------------------- |
| `limit`  | `number` | Max results (default 50)                    |
| `offset` | `number` | Skip N results                              |
| `folder` | `string` | Filter by folder ID (empty string for root) |

### Update fields

| Field    | Type             | Description                    |
| -------- | ---------------- | ------------------------------ |
| `alt`    | `string`         | Alt text                       |
| `folder` | `string \| null` | Move to folder (null for root) |
| `focalX` | `number \| null` | Focal point X (0–100)          |
| `focalY` | `number \| null` | Focal point Y (0–100)          |

## Focal Points

Set a focal point on any image in the asset detail view. Image fields in the admin display thumbnails cropped to the focal point via `object-position`.

## Image Optimization

Uploaded images are automatically optimized when rendered on public pages. The CMS includes an on-demand image transformation endpoint powered by Sharp.

### How it works

Images in rich text and block content are automatically served as optimized WebP with responsive `srcset`. No configuration needed. It works out of the box for all local uploads.

The transformation endpoint is at `/api/cms/img/[...path]`:

```
/api/cms/img/uploads/photo.jpg?w=800        → 800px wide WebP
/api/cms/img/uploads/photo.jpg?w=1024&f=avif → 1024px wide AVIF
/api/cms/img/uploads/photo.jpg?q=90         → quality 90
```

| Param | Type     | Default | Description                             |
| ----- | -------- | ------- | --------------------------------------- |
| `w`   | `number` | —       | Width (snapped to nearest allowed size) |
| `f`   | `string` | `webp`  | Format: `webp`, `avif`, `jpeg`, `png`   |
| `q`   | `number` | `80`    | Quality (1–100)                         |

Transformed images are cached to `.cms-cache/img/` and served with immutable cache headers.

### Helpers for custom templates

Use `cmsImage` and `cmsSrcset` in your own templates:

```typescript
import { cmsImage, cmsSrcset } from "./cms/core/image";

// Single optimized URL
cmsImage("/uploads/photo.jpg", 800);
// → /api/cms/img/uploads/photo.jpg?w=800

// Responsive srcset
cmsSrcset("/uploads/photo.jpg", [480, 768, 1024]);
// → /api/cms/img/uploads/photo.jpg?w=480 480w, ...
```

### Allowed widths

Requested widths are snapped to the nearest allowed size to maximize cache efficiency: 320, 480, 640, 768, 960, 1024, 1280, 1536, 1920.
