import { defineCollection, fields, hasRole, everyone } from "../core/define";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  preview: true,
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
    list: { columns: ["title", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", unique: true, translatable: true, admin: { position: "sidebar" } }),
    summary: fields.text({
      translatable: true,
      admin: { rows: 3 },
      access: { read: hasRole("admin") },
    }),
    image: fields.image(),
    relatedPosts: fields.relation({ collection: "posts", hasMany: true, admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
      access: { update: hasRole("admin") },
    }),
    blocks: fields.blocks({
      translatable: true,
      types: {
        text: {
          heading: fields.text(),
          content: fields.richText(),
        },
        image: {
          images: fields.array({ of: fields.image(), defaultValue: [] }),
        },
        faq: {
          heading: fields.text(),
          items: fields.json({
            admin: { component: "repeater", help: "Add question and answer pairs" },
          }),
        },
      },
    }),
  },
});
