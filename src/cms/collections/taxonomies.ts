import { defineCollection, fields, hasRole, everyone } from "../core/define";

export default defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  access: {
    read: everyone,
    create: hasRole("admin", "editor"),
    update: hasRole("admin", "editor"),
    delete: hasRole("admin"),
  },
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
