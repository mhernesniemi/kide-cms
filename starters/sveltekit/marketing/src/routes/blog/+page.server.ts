import { cms } from "@/cms/.generated/api";

export const load = async () => {
  const posts = await cms.posts.find({
    status: "published",
    sort: { field: "_publishedAt", direction: "desc" },
    limit: 50,
  });
  return {
    posts: posts.map((post) => ({
      slug: String(post.slug ?? ""),
      title: String(post.title ?? ""),
      excerpt: post.excerpt ? String(post.excerpt) : "",
      publishedAt: post._publishedAt ? String(post._publishedAt) : null,
    })),
  };
};
