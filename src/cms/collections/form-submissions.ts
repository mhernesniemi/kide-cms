import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "form-submissions",
  labels: { singular: "Submission", plural: "Submissions" },
  labelField: "label",
  timestamps: true,
  views: {
    list: { columns: ["label", "form", "_createdAt", "status"] },
  },
  fields: {
    label: fields.text({ admin: { hidden: true } }),
    form: fields.relation({ collection: "forms", required: true }),
    status: fields.select({
      options: ["new", "read", "archived"],
      defaultValue: "new",
      admin: { position: "sidebar" },
    }),
    data: fields.json({ admin: { help: "Submitted form data (read-only)." } }),
  },
  hooks: {
    beforeCreate(data) {
      if (!data.label) {
        const submitted = (data.data ?? {}) as Record<string, unknown>;
        const firstValue = Object.values(submitted).find((v) => typeof v === "string" && v.trim()) as
          | string
          | undefined;
        const preview = firstValue ? firstValue.slice(0, 40) : "Submission";
        const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
        data.label = `${preview} — ${ts}`;
      }
      return data;
    },
  },
});
