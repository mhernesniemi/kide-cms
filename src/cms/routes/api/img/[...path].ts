import type { APIRoute } from "astro";
import { getStorage, transformImage } from "../../../core";

export const prerender = false;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

const INLINE_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

const originalContentType = (src: string) =>
  MIME_TYPES[src.slice(src.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

export const GET: APIRoute = async ({ params, url }) => {
  const src = `/${params.path}`;
  const num = (key: string) => (url.searchParams.get(key) ? Number(url.searchParams.get(key)) : undefined);

  const options = {
    width: num("w"),
    height: num("h"),
    format: url.searchParams.get("f") || "webp",
    quality: num("q"),
    focalX: num("fx") ?? null,
    focalY: num("fy") ?? null,
  };

  // On Workers there's no sharp and no filesystem, so resize with the Cloudflare
  // Images binding instead (public pages use /cdn-cgi/image URLs and never get
  // here; admin thumbnails do). Any failure — binding absent, local dev without
  // Images support — falls through to the original below.
  if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") {
    try {
      const { resizeWithImagesBinding } = await import("../../../platform/cloudflare/images");
      const response = await resizeWithImagesBinding(src, options);
      if (response) return response;
    } catch {
      // fall through
    }
  }

  // Node: on-the-fly resizing with sharp against the public/ filesystem. If that
  // can't run (sharp missing), fall back to streaming the untransformed original
  // from storage so images still load.
  try {
    const result = await transformImage(src, options);
    if (result) {
      return new Response(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch {
    // sharp unavailable — serve the original.
  }

  const data = await getStorage().getFile(src);
  if (!data) return new Response("Not found", { status: 404 });

  // Untransformed, so the type comes from the stored extension. Only rasters render inline.
  const contentType = originalContentType(src);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  if (!INLINE_SAFE_TYPES.has(contentType)) headers["Content-Disposition"] = "attachment";

  return new Response(data, { headers });
};
