import type { APIRoute } from "astro";
import { getFileStream } from "./storage";

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

export const GET: APIRoute = async ({ params }) => {
  const filePath = `/uploads/${params.path}`;
  const file = await getFileStream(filePath);

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new Response(file.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
