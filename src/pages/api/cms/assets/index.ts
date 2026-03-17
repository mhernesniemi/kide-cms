import type { APIRoute } from "astro";
import { assets } from "@/cms/core/assets";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;
  const folderParam = url.searchParams.get("folder");
  const folder = folderParam !== null ? (folderParam === "" ? null : folderParam) : undefined;

  const items = await assets.find({ limit, offset, folder });
  const total = await assets.count();

  return Response.json({ items, total });
};
