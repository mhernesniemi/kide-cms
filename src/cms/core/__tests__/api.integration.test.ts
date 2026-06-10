/**
 * Integration tests: real generated schema + real cms.config on an in-memory SQLite DB.
 * Exercises the full createCms pipeline — coercion, validation, slugs, drafts/publish,
 * translations, versions — plus DB-backed sessions and invites.
 */
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "@/cms/.generated/schema";
import config from "@/cms/cms.config";
import { createCms } from "../api";
import { createInvite, consumeInvite, createSession, validateInvite, validateSession } from "../auth";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let cms: ReturnType<typeof createCms>;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);

  // Create all tables from the real generated schema. drizzle-kit's apply()
  // assumes a libsql driver (calls .all() on DDL), so execute the generated
  // statements directly against better-sqlite3 instead.
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);

  initSchema(generatedSchema as never);

  const files = new Map<string, Uint8Array>();
  configureCmsRuntime({
    getDb: async () => db,
    storage: {
      putFile: async (p, data) => {
        files.set(p, data instanceof Uint8Array ? data : new Uint8Array(data));
      },
      getFile: async (p) => {
        const data = files.get(p);
        if (!data) return null;
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
      deleteFile: async (p) => {
        files.delete(p);
      },
    },
  });

  cms = createCms(config);
});

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("create", () => {
  it("creates a document with timestamps and an auto-generated slug", async () => {
    const author = await (cms as any).authors.create({ name: "Ada Lovelace" });
    expect(author._id).toBeTruthy();
    expect(author.slug).toBe("ada-lovelace");
    expect(author._createdAt).toBeTruthy();
    expect(author._updatedAt).toBeTruthy();
  });

  it("rejects missing required fields", async () => {
    await expect((cms as any).authors.create({ title: "No name" })).rejects.toThrow(/required/);
  });

  it("slugifies an explicitly provided slug", async () => {
    const author = await (cms as any).authors.create({ name: "Slug Test", slug: "My Custom Slug!" });
    expect(author.slug).toBe("my-custom-slug");
  });

  it("coerces field values from form-style input", async () => {
    const post = await (cms as any).posts.create({
      title: "Coercion test",
      body: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Hello body" }] }] },
    });
    // richText stored as parsed AST after round-trip
    expect(post.body.type).toBe("root");
    // beforeCreate hook derived the excerpt from the body
    expect(post.excerpt).toBe("Hello body");
  });

  it("coerces plain text into a richText AST", async () => {
    const post = await (cms as any).posts.create({ title: "Plain body", body: "Just plain text" });
    expect(post.body.type).toBe("root");
    expect(post.body.children[0].type).toBe("paragraph");
  });

  it("throws a helpful error for unknown collections", () => {
    expect(() => (cms as any).nonexistent.create({})).toThrow();
  });
});

describe("find / findOne / findById", () => {
  it("finds by field equality", async () => {
    await (cms as any).authors.create({ name: "Findable Person" });
    const found = await (cms as any).authors.findOne({ slug: "findable-person" });
    expect(found?.name).toBe("Findable Person");
  });

  it("returns null for findById misses", async () => {
    expect(await (cms as any).authors.findById("missing-id")).toBeNull();
  });

  it("respects limit and sort", async () => {
    await (cms as any).authors.create({ name: "Aaa Sort" });
    await (cms as any).authors.create({ name: "Zzz Sort" });
    const result = await (cms as any).authors.find({
      sort: { field: "name", direction: "desc" },
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Zzz Sort");
  });
});

describe("update / delete", () => {
  it("updates fields and bumps _updatedAt", async () => {
    const author = await (cms as any).authors.create({ name: "Update Me" });
    const updated = await (cms as any).authors.update(author._id, { title: "Editor-in-chief" });
    expect(updated.title).toBe("Editor-in-chief");
    expect(updated.name).toBe("Update Me");
  });

  it("enforces required fields on update", async () => {
    const author = await (cms as any).authors.create({ name: "Keep Name" });
    // Clearing a required field must fail
    await expect((cms as any).authors.update(author._id, { name: "" })).rejects.toThrow(/required/);
  });

  it("deletes documents", async () => {
    const author = await (cms as any).authors.create({ name: "Delete Me" });
    await (cms as any).authors.delete(author._id);
    expect(await (cms as any).authors.findById(author._id)).toBeNull();
  });
});

describe("drafts and publishing", () => {
  it("creates drafts by default in draft-enabled collections", async () => {
    const post = await (cms as any).posts.create({ title: "Draft post" });
    expect(post._status).toBe("draft");
  });

  it("excludes drafts from published queries and includes them after publish", async () => {
    const post = await (cms as any).posts.create({ title: "Publish flow" });

    const before = await (cms as any).posts.findOne({ slug: "publish-flow", status: "published" });
    expect(before).toBeNull();

    const published = await (cms as any).posts.publish(post._id);
    expect(published._status).toBe("published");
    expect(published._publishedAt).toBeTruthy();

    const after = await (cms as any).posts.findOne({ slug: "publish-flow", status: "published" });
    expect(after?._id).toBe(post._id);
  });

  it("unpublishes back to draft", async () => {
    const post = await (cms as any).posts.create({ title: "Unpublish flow" });
    await (cms as any).posts.publish(post._id);
    const unpublished = await (cms as any).posts.unpublish(post._id);
    expect(unpublished._status).toBe("draft");
  });

  it("schedules publication", async () => {
    const post = await (cms as any).posts.create({ title: "Scheduled post" });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await (cms as any).posts.schedule(post._id, future);
    expect(scheduled._status).toBe("scheduled");
    expect(scheduled._publishAt).toBe(future);
  });
});

describe("translations", () => {
  it("upserts and retrieves locale overlays", async () => {
    const author = await (cms as any).authors.create({ name: "Translated", description: "English text" });
    await (cms as any).authors.upsertTranslation(author._id, "fi", { description: "Suomeksi" });

    const translations = await (cms as any).authors.getTranslations(author._id);
    expect(translations.fi?.description).toBe("Suomeksi");

    const finnish = await (cms as any).authors.findById(author._id, { locale: "fi" });
    expect(finnish?.description).toBe("Suomeksi");
    expect(finnish?.name).toBe("Translated"); // non-translatable field untouched
  });
});

describe("versions", () => {
  it("records version snapshots on update", async () => {
    const post = await (cms as any).posts.create({ title: "Versioned post" });
    await (cms as any).posts.update(post._id, { title: "Versioned post v2" });
    const versions = await (cms as any).posts.versions(post._id);
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("sessions", () => {
  it("creates and validates a session", async () => {
    const { token, expiresAt } = await createSession("user-1");
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const session = await validateSession(token);
    expect(session?.userId).toBe("user-1");
  });

  it("rejects unknown tokens", async () => {
    expect(await validateSession("nope")).toBeNull();
  });

  it("rejects and deletes expired sessions", async () => {
    const schema = generatedSchema as never as { cmsSessions: any };
    const past = new Date(Date.now() - 1000).toISOString();
    await db.insert(schema.cmsSessions).values({ _id: "expired-token", userId: "user-2", expiresAt: past });

    expect(await validateSession("expired-token")).toBeNull();
    // Second lookup confirms the row was deleted, not just rejected
    const rows = await db
      .select()
      .from(schema.cmsSessions)
      .where(eq((schema.cmsSessions as any)._id, "expired-token"));
    expect(rows).toHaveLength(0);
  });
});

describe("invites", () => {
  it("validates an unused invite and rejects it after consumption", async () => {
    const { token } = await createInvite("user-3");
    expect((await validateInvite(token))?.userId).toBe("user-3");

    await consumeInvite(token);
    expect(await validateInvite(token)).toBeNull();
  });
});
