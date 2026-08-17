import type { APIRoute } from "astro";
// Narrow import (not the core barrel): this route compiles in the Cloudflare
// profile too, and the barrel drags in Node-only modules.
import { getStorage } from "../../core/runtime";

export const prerender = false;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Serves runtime-uploaded files through the storage adapter (Node: uploads dir,
// Cloudflare: R2). Node's static layer only knows files present at build time,
// so anything uploaded after `astro build` is invisible to it; this route is the
// fallback that makes production uploads servable. Static files win when both
// exist — same bytes either way.
export const GET: APIRoute = async ({ params }) => {
  const storagePath = `/uploads/${params.path}`;
  const storage = getStorage();

  let body: ReadableStream | ArrayBuffer | null;
  let size: number;
  try {
    if (storage.getFileStream) {
      const file = await storage.getFileStream(storagePath);
      body = file?.body ?? null;
      size = file?.size ?? 0;
    } else {
      // Custom adapters implement only the three-method contract — buffer instead.
      body = await storage.getFile(storagePath);
      size = body instanceof ArrayBuffer ? body.byteLength : 0;
    }
  } catch {
    body = null; // traversal attempt or adapter error — same 404 as a missing file
    size = 0;
  }

  if (!body) {
    return new Response("Not found", { status: 404 });
  }

  const ext = storagePath.substring(storagePath.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
