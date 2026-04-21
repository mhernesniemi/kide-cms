import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "authors",
  labels: { singular: "Author", plural: "Authors" },
  labelField: "name",
  timestamps: true,
  views: {
    list: { columns: ["name", "title", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    description: fields.text({ translatable: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    title: fields.text(),
    avatar: fields.image({
      admin: { placeholder: "https://images.example.com/avatar.jpg" },
    }),
  },
});
