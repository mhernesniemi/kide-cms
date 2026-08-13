import { defineCollection, fields } from "@kidecms/core";

export default defineCollection({
  slug: "examples",
  labels: { singular: "Example", plural: "Examples" },
  timestamps: true,
  drafts: true,
  fields: {
    title: fields.text({ required: true, translatable: true }),
    body: fields.text({ translatable: true, admin: { rows: 8 } }),
  },
});
