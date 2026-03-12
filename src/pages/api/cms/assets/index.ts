import type { APIRoute } from "astro";
import { assets } from "@/cms/core/assets";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;

  const items = await assets.find({ limit, offset });
  const total = await assets.count();

  return Response.json({ items, total });
};
