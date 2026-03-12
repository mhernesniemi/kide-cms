// auto-generated — do not edit
import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const cmsUsers = sqliteTable("cms_users", {
  _id: text("_id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").default("editor"),
  password: text("password").notNull(),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsAuthors = sqliteTable("cms_authors", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  test: text("test"),
  description: text("description"),
  slug: text("slug").unique(),
  role: text("role").notNull(),
  bio: text("bio"),
  avatar: text("avatar"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsAuthorsTranslations = sqliteTable("cms_authors_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsAuthors._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  test: text("test"),
  description: text("description"),
  bio: text("bio"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsPosts = sqliteTable("cms_posts", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").unique(),
  excerpt: text("excerpt"),
  body: text("body"),
  cover: text("cover"),
  category: text("category").default("Product"),
  author: text("author"),
  tags: text("tags"),
  metadata: text("metadata"),
  sortOrder: integer("sort_order").default(0),
  _status: text("_status").notNull().default("draft"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsPostsTranslations = sqliteTable("cms_posts_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsPosts._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").unique(),
  excerpt: text("excerpt"),
  body: text("body"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsPostsVersions = sqliteTable("cms_posts_versions", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id").notNull().references(() => cmsPosts._id, { onDelete: "cascade" }),
  _version: integer("_version").notNull(),
  _snapshot: text("_snapshot").notNull(),
  _createdAt: text("_created_at").notNull(),
});

export const cmsPages = sqliteTable("cms_pages", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").unique(),
  summary: text("summary"),
  layout: text("layout").default("landing"),
  heroImage: text("hero_image"),
  blocks: text("blocks"),
  _status: text("_status").notNull().default("draft"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsPagesTranslations = sqliteTable("cms_pages_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsPages._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  title: text("title").notNull(),
  slug: text("slug").unique(),
  summary: text("summary"),
  blocks: text("blocks"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsPagesVersions = sqliteTable("cms_pages_versions", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id").notNull().references(() => cmsPages._id, { onDelete: "cascade" }),
  _version: integer("_version").notNull(),
  _snapshot: text("_snapshot").notNull(),
  _createdAt: text("_created_at").notNull(),
});

export const cmsAssets = sqliteTable("cms_assets", {
  _id: text("_id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  alt: text("alt"),
  storagePath: text("storage_path").notNull(),
  _createdAt: text("_created_at").notNull(),
});

export const cmsSessions = sqliteTable("cms_sessions", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const cmsTables = {
  users: { main: cmsUsers },
  authors: { main: cmsAuthors, translations: cmsAuthorsTranslations },
  posts: { main: cmsPosts, translations: cmsPostsTranslations, versions: cmsPostsVersions },
  pages: { main: cmsPages, translations: cmsPagesTranslations, versions: cmsPagesVersions },
};