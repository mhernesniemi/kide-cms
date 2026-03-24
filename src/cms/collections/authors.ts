import { defineCollection, fields } from "../core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";
const isEditor = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin" || user?.role === "editor";

export default defineCollection({
  slug: "authors",
  labels: { singular: "Author", plural: "Authors" },
  labelField: "name",
  timestamps: true,
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
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
