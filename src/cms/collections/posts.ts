import { defineCollection, fields, hasRole, everyone } from "../core/define";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  pathPrefix: "blog",
  timestamps: true,
  drafts: true,
  versions: { max: 20 },
  access: {
    read: everyone,
    create: hasRole("admin", "editor"),
    update: hasRole("admin", "editor"),
    delete: hasRole("admin"),
    publish: hasRole("admin", "editor"),
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
