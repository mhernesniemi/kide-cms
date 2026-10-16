import { render } from "svelte/server";
import { cms } from "virtual:kide/api";
import BlockRenderer from "virtual:kide/block-renderer";
import ContentRenderer from "virtual:kide/content-renderer";
import { createPrepareBlock } from "virtual:kide/block-data";
import { parseBlocks, renderRichText, resolveBlocks, resolveContent } from "../../core";

// Live-preview render endpoint for SvelteKit: the preview tab POSTs unsaved rich
// text / blocks / content JSON and swaps the returned HTML into `[data-cms]` slots.
// Renders the project's own Svelte renderers, so previews match the live page.
export async function renderPreview(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  let type: unknown;
  let data: unknown;
  try {
    ({ type, data } = await request.json());
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Editors send rich text / content documents either as objects or as the
  // serialized form-field string; blocks arrive serialized and parseBlocks
  // handles both.
  let parsed: unknown = data;
  if ((type === "content" || type === "richText") && typeof data === "string") {
    try {
      parsed = JSON.parse(data);
    } catch {
      return new Response("Invalid document JSON", { status: 400 });
    }
  }

  const prepare = createPrepareBlock({ url: new URL(request.url), status: "any" });
  let html: string;
  if (type === "blocks") {
    const blocks = await resolveBlocks(cms, parseBlocks(data), "any", prepare);
    html = render(BlockRenderer, { props: { blocks } }).body;
  } else if (type === "content") {
    const segments = await resolveContent(cms, parsed as any, "any", prepare);
    html = render(ContentRenderer, { props: { segments } }).body;
  } else if (type === "richText") {
    html = renderRichText(parsed as any) ?? "";
  } else {
    return new Response("Unknown preview type", { status: 400 });
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
