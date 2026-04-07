import type { APIRoute } from "astro";

import { renderBlock } from "virtual:kide/blocks";
import { renderRichText, parseBlocks } from "@kide/core";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { type, data } = await request.json();

  let html = "";
  if (type === "blocks") {
    const blocks = parseBlocks(data);
    html = '<div class="flex flex-col gap-16">' + blocks.map(renderBlock).join("") + "</div>";
  } else if (type === "richText") {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    html = renderRichText(parsed) ?? "";
  }

  return new Response(html, { headers: { "Content-Type": "text/html" } });
};
