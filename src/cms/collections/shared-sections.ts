import { defineCollection, fields } from "@/cms/core";

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
    blockType: fields.text({
      required: true,
      admin: { hidden: true },
    }),
    block: fields.json({
      required: true,
      admin: {
        component: "shared-section-block",
        help: "Choose a block type, then edit the shared content used by every page that references this section.",
      },
    }),
  },
  hooks: {
    afterCreate(doc, context) {
      context.cache?.invalidate({ tags: ["shared-sections", `shared-section:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["shared-sections", `shared-section:${doc._id}`] });
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["shared-sections", `shared-section:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["shared-sections", `shared-section:${doc._id}`] });
    },
  },
});
