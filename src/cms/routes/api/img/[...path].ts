import type { APIRoute } from "astro";
import { getStorage, transformImage } from "@/cms/core";

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

const originalContentType = (src: string) =>
  MIME_TYPES[src.slice(src.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

export const GET: APIRoute = async ({ params, url }) => {
  const src = `/${params.path}`;
  const num = (key: string) => (url.searchParams.get(key) ? Number(url.searchParams.get(key)) : undefined);

  // On-the-fly resizing needs sharp + a real filesystem (public/). On the
  // Cloudflare target sharp is removed and the dev runtime is workerd (no fs),
  // and uploads live in object storage rather than public/ — so transformImage
  // can't run. Attempt it, but fall back to streaming the untransformed original
  // from storage so images still load. (In production on Cloudflare this route
  // is bypassed entirely: cmsImage() emits /cdn-cgi/image URLs there.)
  try {
    const result = await transformImage(src, {
      width: num("w"),
      height: num("h"),
      format: url.searchParams.get("f") || "webp",
      quality: num("q"),
      focalX: num("fx") ?? null,
      focalY: num("fy") ?? null,
    });
    if (result) {
      return new Response(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch {
    // sharp unavailable / no filesystem in this runtime — serve the original.
  }

  const data = await getStorage().getFile(src);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": originalContentType(src),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
