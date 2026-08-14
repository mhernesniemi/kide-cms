import { defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    terms: fields.json({
      admin: { component: "taxonomy-terms" },
    }),
  },
});
