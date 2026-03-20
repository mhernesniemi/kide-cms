import { defineCollection, fields } from "../core/define";

export default defineCollection({
  slug: "users",
  labels: { singular: "User", plural: "Users" },
  auth: true,
  timestamps: true,
  views: {
    list: { columns: ["name", "email", "role", "_updatedAt"] },
  },
  fields: {
    email: fields.email({ required: true, unique: true }),
    name: fields.text({ required: true }),
    role: fields.select({
      options: ["admin", "editor", "viewer"],
      defaultValue: "editor",
    }),
    password: fields.text({ required: true, admin: { hidden: true } }),
  },
});
