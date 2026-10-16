import { redirect } from "@sveltejs/kit";
import { resolveContent } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";
import { createPrepareBlock } from "@/lib/kide/block-data";
import { cmsPicture } from "@/lib/server/images";

export const load = async ({ params, url }: { params: { slug: string }; url: URL }) => {
  const status = url.searchParams.has("preview") ? "any" : "published";
  const doc = await cms.posts.findOne({ slug: params.slug, status });
  if (!doc) redirect(302, "/blog");
  const image = doc.image
    ? await cmsPicture(String(doc.image), {
        preset: "banner",
        art: [{ media: "(max-width: 640px)", preset: "heroMobile" }],
        sizes: "(max-width: 672px) 100vw, 640px",
      })
    : null;
  return {
    title: String(doc.title ?? ""),
    excerpt: doc.excerpt ? String(doc.excerpt) : "",
    seoDescription: doc.seoDescription,
    image,
    body: await resolveContent(cms, doc.body, status, createPrepareBlock({ url, status })),
    cmsDoc: `posts:${doc._id}`,
  };
};
