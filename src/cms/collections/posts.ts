import { defineCollection, fields } from "../core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";
const isEditor = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin" || user?.role === "editor";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  pathPrefix: "blog",
  timestamps: true,
  drafts: true,
  versions: { max: 20 },
  access: {
    read: () => true,
    create: isEditor,
    update: isEditor,
    delete: isAdmin,
    publish: isEditor,
  },
  views: {
    list: { columns: ["title", "category", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({
      required: true,
      indexed: true,
      translatable: true,
    }),
    slug: fields.slug({ from: "title", unique: true, translatable: true, admin: { position: "sidebar" } }),
    excerpt: fields.text({
      maxLength: 300,
      translatable: true,
      admin: { rows: 3 },
    }),
    image: fields.image(),
    body: fields.richText({ translatable: true, admin: { rows: 14 } }),
    category: fields.text({
      admin: { component: "taxonomy-select", placeholder: "categories", position: "sidebar" },
    }),
    author: fields.relation({ collection: "authors", admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
  },
});
