import { redirect } from "@sveltejs/kit";
import { resolveContent } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";

export const load = async ({ params, url }) => {
  const status = url.searchParams.has("preview") ? "any" : "published";
  const doc = await cms.pages.findOne({ slug: params.slug, status });
  if (!doc) redirect(302, "/");
  return { title: doc.title, body: await resolveContent(cms, doc.body, status) };
};
