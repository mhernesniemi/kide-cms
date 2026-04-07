import type { APIRoute } from "astro";
import { assets } from "virtual:kide/runtime";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const lookupUrl = url.searchParams.get("url");
  if (lookupUrl) {
    const asset = await assets.findByUrl(lookupUrl);
    if (!asset) return Response.json(null, { status: 404 });
    return Response.json(asset);
  }

  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;
  const folderParam = url.searchParams.get("folder");
  const folder = folderParam !== null ? (folderParam === "" ? null : folderParam) : undefined;

  const items = await assets.find({ limit, offset, folder });
  const total = await assets.count();

  return Response.json({ items, total });
};
