// auto-generated — do not edit
import { sqliteTable, text, integer, real, unique } from "drizzle-orm/sqlite-core";

export const cmsUsers = sqliteTable("cms_users", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").default("editor"),
  password: text("password"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsAuthors = sqliteTable("cms_authors", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  avatar: text("avatar"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsAuthorsTranslations = sqliteTable("cms_authors_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsAuthors._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  description: text("description"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsPosts = sqliteTable("cms_posts", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").unique(),
  excerpt: text("excerpt"),
  image: text("image"),
  body: text("body"),
  category: text("category"),
  author: text("author"),
  seoDescription: text("seo_description"),
  _status: text("_status").notNull().default("draft"),
  _publishedAt: text("_published_at"),
  _publishAt: text("_publish_at"),
  _unpublishAt: text("_unpublish_at"),
  _published: text("_published"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsPostsTranslations = sqliteTable("cms_posts_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsPosts._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  title: text("title").notNull(),
  slug: text("slug").unique(),
  excerpt: text("excerpt"),
  body: text("body"),
  seoDescription: text("seo_description"),
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

export const cmsTaxonomies = sqliteTable("cms_taxonomies", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  terms: text("terms"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsTaxonomiesTranslations = sqliteTable("cms_taxonomies_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsTaxonomies._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  terms: text("terms"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsMenus = sqliteTable("cms_menus", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  items: text("items"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsMenusTranslations = sqliteTable("cms_menus_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsMenus._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  items: text("items"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsFrontPage = sqliteTable("cms_front_page", {
  _id: text("_id").primaryKey(),
  blocks: text("blocks"),
  _status: text("_status").notNull().default("draft"),
  _publishedAt: text("_published_at"),
  _publishAt: text("_publish_at"),
  _unpublishAt: text("_unpublish_at"),
  _published: text("_published"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsFrontPageTranslations = sqliteTable("cms_front_page_translations", {
  _id: text("_id").primaryKey(),
  _entityId: text("_entity_id").notNull().references(() => cmsFrontPage._id, { onDelete: "cascade" }),
  _languageCode: text("_language_code").notNull(),
  blocks: text("blocks"),
}, (table) => ({
  uniqueLocale: unique().on(table._entityId, table._languageCode),
}));

export const cmsPages = sqliteTable("cms_pages", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").unique(),
  summary: text("summary"),
  image: text("image"),
  relatedPosts: text("related_posts"),
  seoDescription: text("seo_description"),
  blocks: text("blocks"),
  _status: text("_status").notNull().default("draft"),
  _publishedAt: text("_published_at"),
  _publishAt: text("_publish_at"),
  _unpublishAt: text("_unpublish_at"),
  _published: text("_published"),
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
  seoDescription: text("seo_description"),
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
  focalX: real("focal_x"),
  focalY: real("focal_y"),
  alt: text("alt"),
  folder: text("folder"),
  storagePath: text("storage_path").notNull(),
  _createdAt: text("_created_at").notNull(),
});

export const cmsAssetFolders = sqliteTable("cms_asset_folders", {
  _id: text("_id").primaryKey(),
  name: text("name").notNull(),
  parent: text("parent"),
  _createdAt: text("_created_at").notNull(),
});

export const cmsSessions = sqliteTable("cms_sessions", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const cmsLocks = sqliteTable("cms_locks", {
  _id: text("_id").primaryKey(),
  collection: text("collection").notNull(),
  documentId: text("document_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  lockedAt: text("locked_at").notNull(),
});

export const cmsInvites = sqliteTable("cms_invites", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const cmsTables = {
  users: { main: cmsUsers },
  authors: { main: cmsAuthors, translations: cmsAuthorsTranslations },
  posts: { main: cmsPosts, translations: cmsPostsTranslations, versions: cmsPostsVersions },
  taxonomies: { main: cmsTaxonomies, translations: cmsTaxonomiesTranslations },
  menus: { main: cmsMenus, translations: cmsMenusTranslations },
  "front-page": { main: cmsFrontPage, translations: cmsFrontPageTranslations },
  pages: { main: cmsPages, translations: cmsPagesTranslations, versions: cmsPagesVersions },
};