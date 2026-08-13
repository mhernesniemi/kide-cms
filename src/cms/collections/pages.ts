import { defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  timestamps: true,
  drafts: true,
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", admin: { position: "sidebar" } }),
    body: fields.content(),
  },
});
