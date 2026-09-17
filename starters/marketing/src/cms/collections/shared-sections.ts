import { defineCollection, fields, getSharedSectionCacheTags } from "@kidecms/core";

const invalidate = (
  doc: Record<string, unknown>,
  context: { cache?: { invalidate: (o: { tags: string[] }) => void } },
) => context.cache?.invalidate({ tags: getSharedSectionCacheTags(String(doc._id)) });

export default defineCollection({
  slug: "shared-sections",
  labels: { singular: "Shared Section", plural: "Shared Sections" },
  labelField: "title",
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 20 },
  views: {
    list: { columns: ["title", "blockType", "__usage", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true }),
    blockType: fields.text({ required: true, admin: { hidden: true } }),
    block: fields.json({
      required: true,
      admin: {
        component: "shared-section-block",
        help: "Choose a block type, then edit the shared content used by every page that references this section.",
      },
    }),
  },
  hooks: {
    afterCreate: invalidate,
    afterUpdate: invalidate,
    afterPublish: invalidate,
    afterDelete: invalidate,
  },
});
