import { defineCollection, fields } from "../core/define";

const isAdmin = ({ user }: { user?: { role?: string } | null }) => user?.role === "admin";

export default defineCollection({
  slug: "front-page",
  labels: { singular: "Front Page", plural: "Front Page" },
  singleton: true,
  preview: "/",
  timestamps: true,
  drafts: true,
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
    publish: isAdmin,
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
          ctaHref: fields.text(),
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
