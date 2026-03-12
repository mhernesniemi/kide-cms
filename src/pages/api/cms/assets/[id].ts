import type { APIRoute } from "astro";
import { assets } from "@/cms/core/assets";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return Response.json({ error: "Asset ID is required." }, { status: 400 });

  const asset = await assets.findById(id);
  if (!asset) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(asset);
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return new Response(null, { status: 400 });

  await assets.delete(id);
  return new Response(null, { status: 204 });
};
