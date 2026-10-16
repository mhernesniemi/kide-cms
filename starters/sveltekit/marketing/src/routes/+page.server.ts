import { parseBlocks, resolveBlocks } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";
import { createPrepareBlock } from "@/lib/kide/block-data";

export const load = async ({ url }: { url: URL }) => {
  const status = url.searchParams.has("preview") ? "any" : "published";
  const doc = await cms["front-page"].findOne({ status });
  const blocks = await resolveBlocks(cms, parseBlocks(doc?.blocks), status, createPrepareBlock({ url, status }));
  return { blocks, seoDescription: doc?.seoDescription, cmsDoc: doc ? `front-page:${doc._id}` : undefined };
};
