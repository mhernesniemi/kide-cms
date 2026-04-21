import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "menus",
  labels: { singular: "Menu", plural: "Menus" },
  timestamps: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    items: fields.json({
      translatable: true,
      admin: { component: "menu-items" },
    }),
  },
});
