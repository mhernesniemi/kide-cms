import type { APIRoute } from "astro";
import { isAiEnabled, streamSeoMetadata } from "@/cms/core/ai";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAiEnabled()) {
    return Response.json({ error: "AI features are not enabled." }, { status: 403 });
  }

  const body = await request.json();
  const { title, excerpt, body: pageBody, field } = body;

  if (!title || !field) {
    return Response.json({ error: "title and field are required." }, { status: 400 });
  }

  if (field !== "seoTitle" && field !== "seoDescription") {
    return Response.json({ error: "field must be seoTitle or seoDescription." }, { status: 400 });
  }

  try {
    const result = await streamSeoMetadata({ title, excerpt, body: pageBody, field });
    return result.toTextStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
