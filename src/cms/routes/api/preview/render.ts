import type { APIRoute } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";

import BlockRenderer from "virtual:kide/block-renderer";
import { renderRichText, parseBlocks } from "@/cms/core";

export const prerender = false;

let containerPromise: Promise<AstroContainer> | null = null;
const getContainer = () => {
  if (!containerPromise) {
    containerPromise = (async () => {
      const renderers = await loadRenderers([getContainerRenderer()]);
      return AstroContainer.create({ renderers });
    })();
  }
  return containerPromise;
};

export const POST: APIRoute = async ({ request }) => {
  const { type, data } = await request.json();

  let html = "";
  if (type === "blocks") {
    const blocks = parseBlocks(data);
    const container = await getContainer();
    html = await container.renderToString(BlockRenderer, { props: { blocks } });
  } else if (type === "richText") {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    html = renderRichText(parsed) ?? "";
  }

  return new Response(html, { headers: { "Content-Type": "text/html" } });
};
