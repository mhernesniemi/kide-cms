import { defineCollection, fields } from "../core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";
const isEditor = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin" || user?.role === "editor";

export default defineCollection({
  slug: "taxonomies",
  labels: { singular: "Taxonomy", plural: "Taxonomies" },
  timestamps: true,
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
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
