import { defineCollection, fields } from "@/cms/core";

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
    // Credentials live in the Better Auth `cms_accounts` table, not here — this column
    // is retained only so a legacy row never trips a NOT NULL and is dropped in cleanup.
    password: fields.text({ admin: { hidden: true } }),
    // Better Auth identity columns. Hidden from the admin UI; owned by the auth engine
    // (emailVerified/image) or by the engine's own timestamp bookkeeping (createdAt/
    // updatedAt, stored as epoch-ms integers — distinct from Kide's text _createdAt/
    // _updatedAt, which the auth engine backfills via a database hook).
    emailVerified: fields.boolean({ defaultValue: false, admin: { hidden: true } }),
    image: fields.text({ admin: { hidden: true } }),
    createdAt: fields.number({ admin: { hidden: true } }),
    updatedAt: fields.number({ admin: { hidden: true } }),
  },
});
