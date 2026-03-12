import { existsSync, mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./db";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const ensureUploadsDir = () => {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
};

export type AssetRecord = {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  storagePath: string;
  url: string;
  _createdAt: string;
};

export const assets = {
  async upload(file: File, alt?: string): Promise<AssetRecord> {
    ensureUploadsDir();

    const db = await getDb();
    const schema = await import("../.generated/schema");

    const ext = path.extname(file.name) || "";
    const safeName = `${nanoid(12)}${ext}`;
    const storagePath = `/uploads/${safeName}`;
    const diskPath = path.join(UPLOADS_DIR, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, buffer);

    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.cmsAssets).values({
      _id: id,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width: null,
      height: null,
      alt: alt ?? null,
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
      alt: alt ?? null,
      storagePath,
      url: storagePath,
      _createdAt: now,
    };
  },

  async find(options: { limit?: number; offset?: number } = {}): Promise<AssetRecord[]> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    let query = db.select().from(schema.cmsAssets).orderBy(desc(schema.cmsAssets._createdAt));

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

  async delete(id: string): Promise<void> {
    const db = await getDb();
    const schema = await import("../.generated/schema");

    const rows = await db.select().from(schema.cmsAssets).where(eq(schema.cmsAssets._id, id)).limit(1);

    if (rows.length === 0) return;

    const asset = rows[0] as any;
    const diskPath = path.join(process.cwd(), "public", asset.storagePath);

    try {
      await unlink(diskPath);
    } catch {
      // File may already be deleted
    }

    await db.delete(schema.cmsAssets).where(eq(schema.cmsAssets._id, id));
  },

  async count(): Promise<number> {
    const db = await getDb();
    const schema = await import("../.generated/schema");
    const rows = await db.select({ count: sql<number>`count(*)` }).from(schema.cmsAssets);
    return Number(rows[0]?.count ?? 0);
  },
};
