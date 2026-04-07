import type { APIRoute } from "astro";
import { isAiEnabled, streamSeoDescription } from "@/cms/runtime";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAiEnabled()) {
    return Response.json({ error: "AI features are not enabled." }, { status: 403 });
  }

  const body = await request.json();
  const { title, excerpt, body: pageBody } = body;

  if (!title) {
    return Response.json({ error: "title is required." }, { status: 400 });
  }

  try {
    const result = await streamSeoDescription({ title, excerpt, body: pageBody });
    return result.toTextStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
