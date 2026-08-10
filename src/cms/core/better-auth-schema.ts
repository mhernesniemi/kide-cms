import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle tables as Better Auth's engine sees them.
 *
 * These deliberately mirror the *physical* columns emitted by the schema generator
 * (core/generator.ts) but expose Better Auth's logical property names — most importantly
 * `id` (Better Auth's reserved primary-key field) mapping onto Kide's `_id` column, which
 * cannot be remapped through config. Date fields are epoch-ms integers because Drizzle
 * cannot bind a JS `Date` to a text column.
 *
 * The `user` table is the same physical `cms_users` row Kide edits through the admin UI;
 * `_createdAt`/`_updatedAt` are Kide's canonical text timestamps (backfilled by a database
 * hook in core/better-auth.ts so a Better-Auth-created user never trips their NOT NULL).
 * `createdAt`/`updatedAt` are Better Auth's own integer bookkeeping columns.
 */

export const user = sqliteTable("cms_users", {
  id: text("_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const session = sqliteTable("cms_sessions", {
  id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("cms_accounts", {
  id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("cms_verifications", {
  id: text("_id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** The schema object handed to Better Auth's drizzle adapter (keys = Better Auth model names). */
export const betterAuthSchema = { user, session, account, verification };
