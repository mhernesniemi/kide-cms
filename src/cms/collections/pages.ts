import { defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  timestamps: true,
  drafts: true,
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", translatable: true, admin: { position: "sidebar" } }),
    body: fields.text({ translatable: true, admin: { rows: 8 } }),
  },
});
