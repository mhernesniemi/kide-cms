import type { APIRoute } from "astro";
import { isAiEnabled, streamTranslation } from "@/cms/core/ai";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAiEnabled()) {
    return Response.json({ error: "AI features are not enabled." }, { status: 403 });
  }

  const body = await request.json();
  const { text, sourceLocale, targetLocale, fieldName, fieldType } = body;

  if (!text || !sourceLocale || !targetLocale || !fieldName) {
    return Response.json({ error: "text, sourceLocale, targetLocale, and fieldName are required." }, { status: 400 });
  }

  try {
    const result = await streamTranslation({
      text,
      sourceLocale,
      targetLocale,
      fieldName,
      fieldType: fieldType || "text",
    });
    return result.toTextStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
};
