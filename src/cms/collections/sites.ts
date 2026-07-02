import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "sites",
  labels: { singular: "Site", plural: "Sites" },
  labelField: "name",
  timestamps: true,
  searchable: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  admin: {
    group: "Content",
    icon: "Globe",
    weight: -10,
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name" }),
    domains: fields.array({
      of: fields.text(),
      admin: {
        position: "sidebar",
        help: "Hostnames that should resolve to this site, one per row.",
      },
    }),
  },
});
