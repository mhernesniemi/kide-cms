import { defineCollection, fields, hasRole } from "@kide/core";

export default defineCollection({
  slug: "front-page",
  labels: { singular: "Front Page", plural: "Front Page" },
  singleton: true,
  preview: "/",
  timestamps: true,
  drafts: true,
  access: {
    publish: hasRole("admin"),
  },
  fields: {
    blocks: fields.blocks({
      translatable: true,
      types: {
        hero: {
          eyebrow: fields.text(),
          heading: fields.text({ required: true }),
          body: fields.text(),
          ctaLabel: fields.text(),
          ctaHref: fields.relation({ collection: "pages" }),
        },
        text: {
          heading: fields.text(),
          content: fields.richText(),
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
