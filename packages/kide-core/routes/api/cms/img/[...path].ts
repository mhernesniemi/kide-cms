import type { APIRoute } from "astro";
import { transformImage } from "@kidecms/core";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const src = `/${params.path}`;
  const width = url.searchParams.get("w") ? Number(url.searchParams.get("w")) : undefined;
  const format = url.searchParams.get("f") || "webp";
  const quality = url.searchParams.get("q") ? Number(url.searchParams.get("q")) : undefined;

  const result = await transformImage(src, width, format, quality);

  if (!result) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
