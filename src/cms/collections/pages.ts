import { defineCollection, fields } from "../core/define";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  timestamps: true,
  drafts: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "layout", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true, translatable: true }),
    slug: fields.slug({ from: "title", unique: true, translatable: true, admin: { position: "sidebar" } }),
    summary: fields.text({ translatable: true, admin: { rows: 3 } }),
    image: fields.image(),
    layout: fields.select({
      options: ["default", "landing", "docs"],
      defaultValue: "landing",
      admin: { position: "sidebar" },
    }),
    relatedPosts: fields.relation({ collection: "posts", hasMany: true, admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
    blocks: fields.blocks({
      translatable: true,
      types: {
        hero: {
          eyebrow: fields.text(),
          heading: fields.text({ required: true }),
          body: fields.text(),
          ctaLabel: fields.text(),
          ctaHref: fields.text(),
        },
        text: {
          heading: fields.text(),
          content: fields.richText(),
        },
        gallery: {
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
