import { defineCollection, fields } from "@kide/core";

export default defineCollection({
  slug: "posts",
  labels: { singular: "Post", plural: "Posts" },
  timestamps: true,
  drafts: true,
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", unique: true }),
    body: fields.richText(),
    excerpt: fields.text({ admin: { rows: 3 } }),
  },
});
