import { defineCollection, fields } from "@kidecms/core";
import { pageBlockTypes } from "./page-blocks";

export default defineCollection({
  slug: "front-page",
  labels: { singular: "Front page", plural: "Front page" },
  singleton: true,
  preview: "/",
  timestamps: true,
  drafts: true,
  versions: { max: 20 },
  fields: {
    seoDescription: fields.text({
      maxLength: 160,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
    blocks: fields.blocks({ shared: false, types: pageBlockTypes }),
  },
  hooks: {
    afterPublish(_doc, context) {
      context.cache?.invalidate({ tags: ["front-page"] });
    },
    afterUpdate(_doc, context) {
      context.cache?.invalidate({ tags: ["front-page"] });
    },
  },
});
