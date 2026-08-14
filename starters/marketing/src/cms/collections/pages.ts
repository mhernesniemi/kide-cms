import { defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "pages",
  labels: { singular: "Page", plural: "Pages" },
  preview: true,
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", admin: { position: "sidebar" } }),
    seoDescription: fields.text({
      maxLength: 160,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
    blocks: fields.blocks({
      shared: false,
      types: {
        hero: {
          eyebrow: fields.text(),
          heading: fields.text({ required: true }),
          body: fields.text({ admin: { rows: 3 } }),
          ctaLabel: fields.text(),
          ctaHref: fields.text({ admin: { placeholder: "/contact" } }),
        },
        text: {
          heading: fields.text(),
          content: fields.richText(),
        },
        features: {
          heading: fields.text(),
          items: fields.json({
            admin: { component: "repeater", help: "Add title and description pairs" },
          }),
        },
        cta: {
          heading: fields.text(),
          body: fields.text({ admin: { rows: 2 } }),
          buttonLabel: fields.text(),
          buttonHref: fields.text({ admin: { placeholder: "/contact" } }),
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
  hooks: {
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["pages", `page:${doc._id}`] });
    },
  },
});
