import type { APIRoute } from "astro";
import { transformImage } from "@/cms/core";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const src = `/${params.path}`;
  const num = (key: string) => (url.searchParams.get(key) ? Number(url.searchParams.get(key)) : undefined);

  const result = await transformImage(src, {
    width: num("w"),
    height: num("h"),
    format: url.searchParams.get("f") || "webp",
    quality: num("q"),
    focalX: num("fx") ?? null,
    focalY: num("fy") ?? null,
  });

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
