import type { APIRoute } from "astro";
import config from "@/cms/cms.config";
import { cms } from "@/cms/.generated/api";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.collection;
  const api = slug && config.collections.some((c) => c.slug === slug) ? (cms as Record<string, any>)[slug] : null;
  if (!api) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const docs = await api.find();
  return Response.json({ docs });
};
