import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "form-submissions",
  labels: { singular: "Submission", plural: "Submissions" },
  labelField: "submittedAt",
  timestamps: true,
  views: {
    list: { columns: ["form", "submittedAt", "status"] },
  },
  fields: {
    form: fields.relation({ collection: "forms", required: true }),
    submittedAt: fields.date({ required: true }),
    status: fields.select({
      options: ["new", "read", "archived"],
      defaultValue: "new",
      admin: { position: "sidebar" },
    }),
    data: fields.json({ admin: { help: "Submitted form data (read-only)." } }),
  },
});
