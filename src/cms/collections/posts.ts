import { contentToPlainText, defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  pathPrefix: "blog",
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "category", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({
      required: true,
      indexed: true,
      translatable: true,
    }),
    slug: fields.slug({ from: "title", translatable: true, admin: { position: "sidebar" } }),
    excerpt: fields.text({
      maxLength: 300,
      translatable: true,
      admin: { rows: 3 },
    }),
    image: fields.image(),
    // Mixed prose + inline component blocks (Gutenberg / Lexical-style authoring).
    // Stored as a rich-text AST whose children may include `block` nodes; rendered
    // with <ContentRenderer> which interleaves prose and the block components below.
    body: fields.content({
      translatable: true,
      admin: { rows: 14 },
      fullscreen: true,
      blocks: {
        faq: {
          heading: fields.text(),
          items: fields.json({
            admin: { component: "repeater", help: "Add question and answer pairs" },
          }),
        },
        image: {
          images: fields.array({ of: fields.image(), defaultValue: [] }),
        },
        youtube: {
          url: fields.text({ required: true, admin: { component: "youtube", placeholder: "Paste a YouTube URL" } }),
        },
      },
    }),
    category: fields.text({
      admin: { component: "taxonomy-select", placeholder: "categories", position: "sidebar" },
    }),
    author: fields.relation({ collection: "authors", admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
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
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["posts", `post:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["posts", "home", `post:${doc._id}`] });
    },
  },
});
