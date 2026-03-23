import { eq, desc, sql, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./db";
import { putFile, deleteFile } from "./storage";

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

export const assets = {
  async upload(file: File, options?: { alt?: string; folder?: string }): Promise<AssetRecord> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const safeName = `${nanoid(12)}${ext}`;
    const storagePath = `/uploads/${safeName}`;

    await putFile(storagePath, new Uint8Array(await file.arrayBuffer()));

    const id = nanoid();
    const now = new Date().toISOString();
    const folder = options?.folder || null;

    await db.insert(schema.cmsAssets).values({
      _id: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width: null,
      height: null,
      alt: options?.alt ?? null,
      folder,
      storagePath,
      _createdAt: now,
    });

    return {
      _id: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width: null,
      height: null,
      focalX: null,
      focalY: null,
      alt: options?.alt ?? null,
      folder,
      storagePath,
      url: storagePath,
      _createdAt: now,
    };
  },

  async find(options: { limit?: number; offset?: number; folder?: string | null } = {}): Promise<AssetRecord[]> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const conditions =
      options.folder !== undefined
        ? options.folder === null
          ? isNull(schema.cmsAssets.folder)
          : eq(schema.cmsAssets.folder, options.folder)
        : undefined;

    let query = db.select().from(schema.cmsAssets).where(conditions).orderBy(desc(schema.cmsAssets._createdAt));

    if (options.limit) query = query.limit(options.limit) as any;
    if (options.offset) query = query.offset(options.offset) as any;

    const rows = await query;
    return rows.map((row: any) => ({
      ...row,
      url: row.storagePath,
    }));
  },

  async findById(id: string): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);

    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return { ...row, url: row.storagePath };
  },

  async findByUrl(url: string): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets.storagePath, url)).limit(1);

    if (rows.length === 0) return null;
    const row = rows[0] as any;
    return { ...row, url: row.storagePath };
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);

    if (rows.length === 0) return;

    const asset = rows[0] as any;
    await deleteFile(asset.storagePath);

    await db.delete(schema.cmsAssets).where(eq(schema.cmsAssets._id, id));
  },

  async update(
    id: string,
    data: { alt?: string; filename?: string; folder?: string | null; focalX?: number | null; focalY?: number | null },
  ): Promise<AssetRecord | null> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

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
    }

    return this.findById(id);
  },

  async count(): Promise<number> {
    const db = await getDb();
    const schema = await import("../.generated/schema");
    const rows = await db.select({ count: sql<number>`count(*)` }).from(schema.cmsAssets);
    return Number(rows[0]?.count ?? 0);
  },
};

export const folders = {
  async create(name: string, parent?: string | null): Promise<FolderRecord> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.cmsAssetFolders).values({
      _id: id,
      name,
      parent: parent ?? null,
      _createdAt: now,
    });

    return { _id: id, name, parent: parent ?? null, _createdAt: now };
  },

  async findByParent(parent: string | null): Promise<FolderRecord[]> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const condition =
      parent === null ? isNull(schema.cmsAssetFolders.parent) : eq(schema.cmsAssetFolders.parent, parent);

    const rows = await db.select().from(schema.cmsAssetFolders).where(condition).orderBy(schema.cmsAssetFolders.name);

    return rows as FolderRecord[];
  },

  async findById(id: string): Promise<FolderRecord | null> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssetFolders).where(eq(schema.cmsAssetFolders._id, id)).limit(1);
    return rows.length > 0 ? (rows[0] as FolderRecord) : null;
  },

  async findAll(): Promise<FolderRecord[]> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssetFolders).orderBy(schema.cmsAssetFolders.name);
    return rows as FolderRecord[];
  },

  async rename(id: string, name: string): Promise<FolderRecord | null> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    await db.update(schema.cmsAssetFolders).set({ name }).where(eq(schema.cmsAssetFolders._id, id));
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    // Move assets in this folder to root
    await db.update(schema.cmsAssets).set({ folder: null }).where(eq(schema.cmsAssets.folder, id));
    // Move subfolders to root
    await db.update(schema.cmsAssetFolders).set({ parent: null }).where(eq(schema.cmsAssetFolders.parent, id));
    // Delete the folder
    await db.delete(schema.cmsAssetFolders).where(eq(schema.cmsAssetFolders._id, id));
  },
};
