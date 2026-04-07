import type { APIRoute } from "astro";
import { isAiEnabled, streamAltText } from "virtual:kide/runtime";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAiEnabled()) {
    return Response.json({ error: "AI features are not enabled." }, { status: 403 });
  }

  const body = await request.json();
  const { imageUrl, filename } = body;

  if (!imageUrl || !filename) {
    return Response.json({ error: "imageUrl and filename are required." }, { status: 400 });
  }

  try {
    const result = await streamAltText(imageUrl, filename);
    return result.toTextStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
