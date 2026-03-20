import { defineCollection, fields } from "../core/define";

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
    slug: fields.slug({ from: "name", unique: true }),
    title: fields.text({ required: true }),
    avatar: fields.image({
      admin: { placeholder: "https://images.example.com/avatar.jpg" },
    }),
  },
});
