import { defineCollection, fields, hasRole, everyone } from "../core/define";

export default defineCollection({
  slug: "authors",
  labels: { singular: "Author", plural: "Authors" },
  labelField: "name",
  timestamps: true,
  access: {
    read: everyone,
    create: hasRole("admin", "editor"),
    update: hasRole("admin", "editor"),
    delete: hasRole("admin"),
  },
  views: {
    list: { columns: ["name", "title", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    description: fields.text({ translatable: true }),
    slug: fields.slug({ from: "name", unique: true, admin: { position: "sidebar" } }),
    title: fields.text({ required: true }),
    avatar: fields.image({
      admin: { placeholder: "https://images.example.com/avatar.jpg" },
    }),
  },
});
