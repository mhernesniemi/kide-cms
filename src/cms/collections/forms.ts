import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "forms",
  labels: { singular: "Form", plural: "Forms" },
  labelField: "title",
  timestamps: true,
  views: {
    list: { columns: ["title", "slug", "_updatedAt"] },
  },
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: "title", unique: true, admin: { position: "sidebar" } }),
    submitRedirect: fields.text({
      admin: { help: "Optional URL to redirect to after submit. Leave empty to stay on the page." },
    }),
    successMessage: fields.text({
      defaultValue: "Thanks — we got your message.",
      admin: { rows: 2 },
    }),
    notificationEmail: fields.email({
      admin: { position: "sidebar", help: "Send an email here on each submission (requires RESEND_API_KEY)." },
    }),
    fields: fields.blocks({
      types: {
        text: {
          name: fields.text({ required: true, admin: { help: "Field name used in form data (e.g. name)" } }),
          label: fields.text({ required: true }),
          placeholder: fields.text(),
          required: fields.boolean(),
          maxLength: fields.number(),
        },
        email: {
          name: fields.text({ required: true }),
          label: fields.text({ required: true }),
          placeholder: fields.text(),
          required: fields.boolean(),
        },
        textarea: {
          name: fields.text({ required: true }),
          label: fields.text({ required: true }),
          placeholder: fields.text(),
          required: fields.boolean(),
          rows: fields.number({ defaultValue: 4 }),
        },
        select: {
          name: fields.text({ required: true }),
          label: fields.text({ required: true }),
          required: fields.boolean(),
          options: fields.array({ of: fields.text(), defaultValue: [] }),
        },
        checkbox: {
          name: fields.text({ required: true }),
          label: fields.text({ required: true }),
          required: fields.boolean(),
        },
      },
    }),
  },
});
