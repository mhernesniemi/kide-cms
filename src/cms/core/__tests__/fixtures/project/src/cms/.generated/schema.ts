// auto-generated — do not edit
import { sqliteTable, text, integer, real, unique, index, primaryKey } from "drizzle-orm/sqlite-core";

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
  title: text("title"),
  avatar: text("avatar"),
  _createdAt: text("_created_at").notNull(),
  _updatedAt: text("_updated_at").notNull(),
});

export const cmsAuthorsTranslations = sqliteTable(
  "cms_authors_translations",
  {
    _id: text("_id").primaryKey(),
    _entityId: text("_entity_id")
      .notNull()
      .references(() => cmsAuthors._id, { onDelete: "cascade" }),
    _languageCode: text("_language_code").notNull(),
    description: text("description"),
  },
  (table) => ({
    uniqueLocale: unique().on(table._entityId, table._languageCode),
  }),
);

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

export const cmsPostsTranslations = sqliteTable(
  "cms_posts_translations",
  {
    _id: text("_id").primaryKey(),
    _entityId: text("_entity_id")
      .notNull()
      .references(() => cmsPosts._id, { onDelete: "cascade" }),
    _languageCode: text("_language_code").notNull(),
    title: text("title").notNull(),
    slug: text("slug").unique(),
    excerpt: text("excerpt"),
    body: text("body"),
    seoDescription: text("seo_description"),
  },
  (table) => ({
    uniqueLocale: unique().on(table._entityId, table._languageCode),
  }),
);

export const cmsPostsVersions = sqliteTable("cms_posts_versions", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id")
    .notNull()
    .references(() => cmsPosts._id, { onDelete: "cascade" }),
  _version: integer("_version").notNull(),
  _snapshot: text("_snapshot").notNull(),
  _createdAt: text("_created_at").notNull(),
});

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

export const cmsPagesTranslations = sqliteTable(
  "cms_pages_translations",
  {
    _id: text("_id").primaryKey(),
    _entityId: text("_entity_id")
      .notNull()
      .references(() => cmsPages._id, { onDelete: "cascade" }),
    _languageCode: text("_language_code").notNull(),
    title: text("title").notNull(),
    slug: text("slug").unique(),
    summary: text("summary"),
    seoDescription: text("seo_description"),
    blocks: text("blocks"),
  },
  (table) => ({
    uniqueLocale: unique().on(table._entityId, table._languageCode),
  }),
);

export const cmsPagesVersions = sqliteTable("cms_pages_versions", {
  _id: text("_id").primaryKey(),
  _docId: text("_doc_id")
    .notNull()
    .references(() => cmsPages._id, { onDelete: "cascade" }),
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
  hash: text("hash"),
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

export const cmsPasswordResets = sqliteTable("cms_password_resets", {
  _id: text("_id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const cmsRateLimits = sqliteTable(
  "cms_rate_limits",
  {
    _id: text("_id").primaryKey(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    expiryIdx: index("rate_limits_expiry_idx").on(table.expiresAt),
  }),
);

export const cmsAuditLog = sqliteTable(
  "cms_audit_log",
  {
    _id: text("_id").primaryKey(),
    timestamp: integer("timestamp").notNull(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceCollection: text("resource_collection"),
    resourceId: text("resource_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => ({
    timestampIdx: index("audit_timestamp_idx").on(table.timestamp),
    actorIdx: index("audit_actor_idx").on(table.actorId),
    resourceIdx: index("audit_resource_idx").on(table.resourceType, table.resourceCollection, table.resourceId),
  }),
);

export const cmsOutbox = sqliteTable(
  "cms_outbox",
  {
    _id: text("_id").primaryKey(),
    type: text("type").notNull(),
    payload: text("payload"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    dedupeKey: text("dedupe_key"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    dueIdx: index("outbox_due_idx").on(table.status, table.nextAttemptAt),
    dedupeIdx: index("outbox_dedupe_idx").on(table.dedupeKey),
  }),
);

export const cmsCollaboration = sqliteTable(
  "cms_collaboration",
  {
    collection: text("collection").notNull(),
    documentId: text("document_id").notNull(),
    reviewState: text("review_state").notNull(),
    editor: text("editor"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collection, table.documentId] }),
  }),
);

export const cmsComments = sqliteTable(
  "cms_comments",
  {
    _id: text("_id").primaryKey(),
    collection: text("collection").notNull(),
    documentId: text("document_id").notNull(),
    field: text("field"),
    body: text("body").notNull(),
    authorId: text("author_id"),
    authorEmail: text("author_email"),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    docIdx: index("comments_doc_idx").on(table.collection, table.documentId),
  }),
);

export const cmsTables = {
  users: { main: cmsUsers },
  authors: { main: cmsAuthors, translations: cmsAuthorsTranslations },
  posts: { main: cmsPosts, translations: cmsPostsTranslations, versions: cmsPostsVersions },
  pages: { main: cmsPages, translations: cmsPagesTranslations, versions: cmsPagesVersions },
};
