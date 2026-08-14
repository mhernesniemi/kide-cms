import { defineCollection, fields } from "@kidecms/core";
import { pageBlockTypes } from "./page-blocks";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  preview: true,
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
    blocks: fields.blocks({ shared: false, types: pageBlockTypes }),
  },
  hooks: {
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
  },
});
