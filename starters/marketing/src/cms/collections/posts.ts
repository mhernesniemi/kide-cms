import { contentToPlainText, defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  pathPrefix: "blog",
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "__page", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true, indexed: true }),
    slug: fields.slug({ from: "title", admin: { position: "sidebar" } }),
    excerpt: fields.text({ maxLength: 300, admin: { rows: 3 } }),
    image: fields.image(),
    body: fields.content({ admin: { rows: 14 }, fullscreen: true }),
    category: fields.text({
      admin: { component: "taxonomy-select", placeholder: "categories", position: "sidebar" },
    }),
    seoDescription: fields.text({
      maxLength: 160,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
  },
  hooks: {
    beforeCreate(data) {
      if (!data.excerpt && typeof data.body === "object" && data.body) {
        const text = contentToPlainText(data.body as never);
        if (text) data.excerpt = text.slice(0, 180);
      }
      return data;
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterUnpublish(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
  },
});
