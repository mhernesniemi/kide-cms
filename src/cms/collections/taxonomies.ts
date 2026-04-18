import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", unique: true, admin: { position: "sidebar" } }),
    terms: fields.json({
      translatable: true,
      admin: { component: "taxonomy-terms" },
    }),
  },
});
