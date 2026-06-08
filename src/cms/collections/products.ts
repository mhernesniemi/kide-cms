import { defineCollection, fields, richTextToPlainText } from "@/cms/core";

export default defineCollection({
  slug: "products",
  labels: { singular: "Product", plural: "Products" },
  pathPrefix: "shop",
  timestamps: true,
  drafts: true,
  searchable: true,
  versions: { max: 10 },
  views: {
    list: { columns: ["title", "price", "stock", "active", "_status", "_updatedAt"] },
  },
  fields: {
    title: fields.text({
      required: true,
      indexed: true,
      translatable: true,
    }),
    slug: fields.slug({ from: "title", translatable: true, admin: { position: "sidebar" } }),
    description: fields.richText({ translatable: true, admin: { rows: 10 } }),
    image: fields.image(),
    price: fields.number({
      required: true,
      admin: { help: "Price in the smallest currency unit (e.g. cents). 1000 = 10.00 EUR." },
    }),
    currency: fields.select({
      options: ["eur", "usd", "gbp", "sek", "nok", "dkk"],
      defaultValue: "eur",
      admin: { position: "sidebar" },
    }),
    stock: fields.number({
      admin: {
        position: "sidebar",
        help: "Leave empty for unlimited stock.",
      },
    }),
    active: fields.boolean({
      defaultValue: true,
      admin: { position: "sidebar", help: "Only active products can be purchased." },
    }),
    sku: fields.text({ admin: { position: "sidebar" } }),
    variants: fields.blocks({
      admin: {
        help: "Optional. Add variants if this product has options (size, color, etc.). Each variant's id must be unique.",
      },
      types: {
        variant: {
          id: fields.text({
            required: true,
            admin: { help: 'Stable identifier — e.g. "s-red". Used by the cart; do not change after orders exist.' },
          }),
          label: fields.text({
            required: true,
            admin: { help: 'Shown to customers — e.g. "Small / Red".' },
          }),
          sku: fields.text(),
          priceOverride: fields.number({
            admin: { help: "Optional. Falls back to product price if empty. In smallest currency unit." },
          }),
          stockOverride: fields.number({
            admin: { help: "Optional. Falls back to product stock if empty. Leave empty for unlimited." },
          }),
          attributes: fields.json({
            admin: {
              help: 'Option values keyed by axis — e.g. { "size": "S", "color": "Red" }. Used to render the variant picker.',
            },
          }),
        },
      },
    }),
    seoDescription: fields.text({
      maxLength: 160,
      translatable: true,
      admin: { rows: 3, help: "Meta description for search engines. Max 160 characters.", position: "sidebar" },
    }),
  },
  hooks: {
    beforeCreate(data) {
      if (!data.seoDescription && typeof data.description === "object" && data.description) {
        const text = richTextToPlainText(data.description as never);
        if (text) data.seoDescription = text.slice(0, 160);
      }
      return data;
    },
    afterPublish(doc, context) {
      context.cache?.invalidate({ tags: ["products", `product:${doc._id}`] });
    },
    afterUpdate(doc, context) {
      context.cache?.invalidate({ tags: ["products", `product:${doc._id}`] });
    },
    afterDelete(doc, context) {
      context.cache?.invalidate({ tags: ["products", `product:${doc._id}`] });
    },
  },
});
