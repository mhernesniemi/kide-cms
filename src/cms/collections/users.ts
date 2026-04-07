import { defineCollection, fields } from "@kide/core";

export default defineCollection({
  slug: "users",
  labels: { singular: "User", plural: "Users" },
  auth: true,
  timestamps: true,
  views: {
    list: { columns: ["name", "email", "role", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    email: fields.email({ required: true, unique: true }),
    role: fields.select({
      options: ["admin", "editor", "viewer"],
      defaultValue: "editor",
    }),
    password: fields.text({ admin: { hidden: true } }),
  },
});
