import { createHash } from "node:crypto";
import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { AssetInUseError, findAssetUsage, getUsageConfig } from "./asset-usage";
import type { CMSConfig } from "./define";
import { logAudit, type AuditActor } from "./audit";
import { getDb, getStorage } from "./runtime";
import { getSchema } from "./schema";

export type AssetContext = {
  actor?: AuditActor;
  /** Skip the in-use check. The admin sets this once the editor has confirmed the warning. */
  force?: boolean;
  /**
   * Config used for the in-use check. Pass it explicitly from any caller that
   * deletes — relying on the copy `createCms()` registers makes the guard depend
   * on whether something else in the process imported the generated API first.
   */
  config?: CMSConfig;
};

export type AssetRecord = {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  focalX: number | null;
  focalY: number | null;
  alt: string | null;
  folder: string | null;
  storagePath: string;
  url: string;
  _createdAt: string;
};

export type FolderRecord = {
  _id: string;
  name: string;
  parent: string | null;
  _createdAt: string;
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

// Served from the admin's own origin, so any of these would execute as script there.
const ACTIVE_CONTENT_EXTENSIONS = new Set([
  "html",
  "htm",
  "xhtml",
  "shtml",
  "xml",
  "svg",
  "js",
  "mjs",
  "cjs",
  "php",
  "phtml",
  "asp",
  "aspx",
  "jsp",
]);

/** The stored extension decides how the file is served, so derive it from the verified type. */
const storedExtension = (file: File): string => {
  const known = EXTENSION_BY_MIME[file.type];
  if (known) return known;

  // Unknown type — only reachable via a custom `admin.uploads.allowedTypes`.
  const raw = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "";
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned || cleaned.length > 8 || ACTIVE_CONTENT_EXTENSIONS.has(cleaned)) return "";
  return `.${cleaned}`;
};

export const assets = {
  async upload(
    file: File,
    options?: { alt?: string; folder?: string; dedupe?: boolean },
    context?: AssetContext,
  ): Promise<AssetRecord> {
    const db = await getDb();
    const schema = getSchema();
    const storage = getStorage();

    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");

    // Content-hash dedupe — re-running a media import won't re-upload identical
    // files. Returns the existing asset, so importers stay idempotent without an
    // external id→storagePath map.
    if (options?.dedupe) {
      const existing = await this.findByHash(hash);
      if (existing) return existing;
    }

    const safeName = `${nanoid(12)}${storedExtension(file)}`;
    const storagePath = `/uploads/${safeName}`;

    await storage.putFile(storagePath, bytes);

    // Capture intrinsic dimensions for rasters so consumers can prevent layout shift.
    let width: number | null = null;
    let height: number | null = null;
    if ((file.type || "").startsWith("image/") && file.type !== "image/svg+xml") {
      try {
        const sharpModule = "sharp";
        const sharp = (await import(/* @vite-ignore */ sharpModule)).default;
        const meta = await sharp(bytes).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // Unreadable/unsupported image — leave dimensions null.
      }
    }

    const id = nanoid();
    const createdAt = new Date().toISOString();
    const folder = options?.folder || null;

    await db.insert(schema.cmsAssets).values({
      _id: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width,
      height,
      alt: options?.alt ?? null,
      folder,
      storagePath,
      hash,
      _createdAt: createdAt,
    });

    logAudit({
      action: "asset.upload",
      resourceType: "asset",
      resourceId: id,
      actor: context?.actor ?? null,
    });

    return {
      _id: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width,
      height,
      focalX: null,
      focalY: null,
      alt: options?.alt ?? null,
      folder,
      storagePath,
      url: storagePath,
      _createdAt: createdAt,
    };
  },

  async find(
    options: { limit?: number; offset?: number; folder?: string | null; search?: string } = {},
  ): Promise<AssetRecord[]> {
    const db = await getDb();
    const schema = getSchema();

    let query = db
      .select()
      .from(schema.cmsAssets)
      .where(buildAssetFilter(schema, options))
      .orderBy(desc(schema.cmsAssets._createdAt));
    if (options.limit) query = query.limit(options.limit) as any;
    if (options.offset) query = query.offset(options.offset) as any;

    const rows = await query;
    return rows.map((row: any) => ({ ...row, url: row.storagePath }));
  },

  async findById(id: string): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return { ...row, url: row.storagePath };
  },

  async findByUrl(url: string): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets.storagePath, url)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return { ...row, url: row.storagePath };
  },

  async findByHash(hash: string): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets.hash, hash)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return { ...row, url: row.storagePath };
  },

  async delete(id: string, context?: AssetContext): Promise<void> {
    const db = await getDb();
    const schema = getSchema();
    const storage = getStorage();
    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);
    if (rows.length === 0) return;
    const asset = rows[0] as any;

    // Guarded here, not only in the admin — DELETE /api/cms/assets/:id is reachable
    // directly. Never skip the check silently: with no config there is nothing to
    // check against, and proceeding would delete a referenced asset without a word.
    // Callers that genuinely want an unchecked delete pass `force`.
    if (!context?.force) {
      const config = context?.config ?? getUsageConfig();
      if (!config) {
        throw new Error(
          "assets.delete() cannot check whether this asset is in use — pass `config` in the context " +
            "(or `force: true` to delete without checking).",
        );
      }
      const { refs, incomplete } = await findAssetUsage(config, asset.storagePath);
      // A collection we could not search is not evidence of "unused" — refuse
      // rather than delete something that may still be referenced.
      if (refs.length > 0 || incomplete.length > 0) throw new AssetInUseError(id, refs, incomplete);
    }

    await storage.deleteFile(asset.storagePath);
    await db.delete(schema.cmsAssets).where(eq(schema.cmsAssets._id, id));

    logAudit({
      action: "asset.delete",
      resourceType: "asset",
      resourceId: id,
      actor: context?.actor ?? null,
    });
  },

  async update(
    id: string,
    data: { alt?: string; filename?: string; folder?: string | null; focalX?: number | null; focalY?: number | null },
    context?: AssetContext,
  ): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);
    if (rows.length === 0) return null;

    const updateValues: Record<string, unknown> = {};
    if (data.alt !== undefined) updateValues.alt = data.alt;
    if (data.filename !== undefined) updateValues.filename = data.filename;
    if (data.folder !== undefined) updateValues.folder = data.folder;
    if (data.focalX !== undefined) updateValues.focalX = data.focalX;
    if (data.focalY !== undefined) updateValues.focalY = data.focalY;

    if (Object.keys(updateValues).length > 0) {
      await db.update(schema.cmsAssets).set(updateValues).where(eq(schema.cmsAssets._id, id));
      logAudit({
        action: "asset.update",
        resourceType: "asset",
        resourceId: id,
        actor: context?.actor ?? null,
      });
    }

    return this.findById(id);
  },

  async count(options: { folder?: string | null; search?: string } = {}): Promise<number> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cmsAssets)
      .where(buildAssetFilter(schema, options));
    return Number(rows[0]?.count ?? 0);
  },
};

// Shared WHERE builder for asset find/count: optional folder scope + filename search.
function buildAssetFilter(schema: ReturnType<typeof getSchema>, options: { folder?: string | null; search?: string }) {
  const conditions = [];
  if (options.folder !== undefined) {
    conditions.push(
      options.folder === null ? isNull(schema.cmsAssets.folder) : eq(schema.cmsAssets.folder, options.folder),
    );
  }
  if (options.search?.trim()) {
    // Match the term against both the filename and the alt text.
    const term = `%${options.search.trim()}%`;
    conditions.push(or(like(schema.cmsAssets.filename, term), like(schema.cmsAssets.alt, term)));
  }
  return conditions.length ? and(...conditions) : undefined;
}

export const folders = {
  async create(name: string, parent?: string | null): Promise<FolderRecord> {
    const db = await getDb();
    const schema = getSchema();
    const id = nanoid();
    const createdAt = new Date().toISOString();

    await db.insert(schema.cmsAssetFolders).values({
      _id: id,
      name,
      parent: parent ?? null,
      _createdAt: createdAt,
    });

    return { _id: id, name, parent: parent ?? null, _createdAt: createdAt };
  },

  async findByParent(parent: string | null): Promise<FolderRecord[]> {
    const db = await getDb();
    const schema = getSchema();
    const condition =
      parent === null ? isNull(schema.cmsAssetFolders.parent) : eq(schema.cmsAssetFolders.parent, parent);
    const rows = await db.select().from(schema.cmsAssetFolders).where(condition).orderBy(schema.cmsAssetFolders.name);
    return rows as FolderRecord[];
  },

  async findById(id: string): Promise<FolderRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssetFolders).where(eq(schema.cmsAssetFolders._id, id)).limit(1);
    return rows.length > 0 ? (rows[0] as FolderRecord) : null;
  },

  async findAll(): Promise<FolderRecord[]> {
    const db = await getDb();
    const schema = getSchema();
    const rows = await db.select().from(schema.cmsAssetFolders).orderBy(schema.cmsAssetFolders.name);
    return rows as FolderRecord[];
  },

  async rename(id: string, name: string): Promise<FolderRecord | null> {
    const db = await getDb();
    const schema = getSchema();
    await db.update(schema.cmsAssetFolders).set({ name }).where(eq(schema.cmsAssetFolders._id, id));
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    const schema = getSchema();
    // Un-file assets in this folder so they resurface under "Unfiled" rather than
    // pointing at a folder that no longer exists (which would orphan them).
    await db.update(schema.cmsAssets).set({ folder: null }).where(eq(schema.cmsAssets.folder, id));
    // Promote any direct subfolders to the top level so the tree stays reachable.
    await db.update(schema.cmsAssetFolders).set({ parent: null }).where(eq(schema.cmsAssetFolders.parent, id));
    await db.delete(schema.cmsAssetFolders).where(eq(schema.cmsAssetFolders._id, id));
  },
};

type RichTextLikeNode = { type?: string; src?: unknown; children?: unknown[]; [key: string]: unknown };

const collectLocalImageSrcs = (node: unknown, into: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const child of node) collectLocalImageSrcs(child, into);
    return;
  }
  if (!node || typeof node !== "object") return;

  const candidate = node as RichTextLikeNode;
  if (candidate.type === "image" && typeof candidate.src === "string" && candidate.src.startsWith("/uploads/")) {
    into.add(candidate.src);
  }
  if (Array.isArray(candidate.children)) collectLocalImageSrcs(candidate.children, into);
};

const withoutMissingImages = <T>(node: T, missing: Set<string>): T => {
  if (Array.isArray(node)) {
    return node
      .filter((child) => {
        const candidate = child as RichTextLikeNode | null;
        return !(
          candidate &&
          typeof candidate === "object" &&
          candidate.type === "image" &&
          typeof candidate.src === "string" &&
          missing.has(candidate.src)
        );
      })
      .map((child) => withoutMissingImages(child, missing)) as unknown as T;
  }
  if (!node || typeof node !== "object") return node;

  const candidate = node as RichTextLikeNode;
  if (!Array.isArray(candidate.children)) return node;
  return { ...candidate, children: withoutMissingImages(candidate.children, missing) } as unknown as T;
};

/**
 * Drops `image` nodes whose upload no longer exists from a rich-text / content
 * document. The renderers are synchronous string builders, so this is the async
 * pass that keeps a deleted asset from emitting a <picture> of 404s.
 *
 * Returns the document unchanged when nothing is missing (the common case).
 */
export const stripMissingAssetImages = async <T>(document: T): Promise<T> => {
  const srcs = new Set<string>();
  collectLocalImageSrcs(document, srcs);
  if (srcs.size === 0) return document;

  const missing = new Set<string>();
  await Promise.all(
    [...srcs].map(async (src) => {
      if (!(await assets.findByUrl(src))) missing.add(src);
    }),
  );
  if (missing.size === 0) return document;

  return withoutMissingImages(document, missing);
};
