import { defineCollection, fields } from "../core/define";

export default defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", unique: true }),
    terms: fields.json({
      defaultValue: {} as any,
      translatable: true,
      admin: { component: "taxonomy-terms" },
    }),
  },
});
