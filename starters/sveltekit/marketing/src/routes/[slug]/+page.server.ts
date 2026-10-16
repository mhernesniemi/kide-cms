import { redirect } from "@sveltejs/kit";
import { resolveContent } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";
import { createPrepareBlock } from "@/lib/kide/block-data";

export const load = async ({ params, url }: { params: { slug: string }; url: URL }) => {
  const status = url.searchParams.has("preview") ? "any" : "published";
  const doc = await cms.pages.findOne({ slug: params.slug, status });
  if (!doc) redirect(302, "/");
  const body = await resolveContent(cms, doc.body, status, createPrepareBlock({ url, status }));
  return { title: doc.title, seoDescription: doc.seoDescription, body, cmsDoc: `pages:${doc._id}` };
};
