/**
 * Regression tests for the auth-collection access defaults. Collections are
 * default-allow, but `auth: true` collections are not — without these guarantees any
 * signed-in account could grant itself `admin`, overwrite another user's password, or
 * delete accounts through the ordinary collection API.
 */
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "@/cms/.generated/schema";
import config from "@/cms/cms.config";
import { __testHooks, createCms } from "../api";
import { verifyPassword } from "../auth";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let cms: any;

const system = { _system: true } as const;

let adminId: string;
let viewerId: string;
/** The context the HTTP layer builds for a signed-in non-admin. */
let viewerCtx: { user: { id: string; role: string; email: string } };

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: {
      putFile: async () => {},
      getFile: async () => null,
      deleteFile: async () => {},
    },
  });
  cms = createCms(config);

  const admin = await cms.users.create(
    { name: "Admin", email: "admin@example.com", role: "admin", password: "admin-pw" },
    system,
  );
  const viewer = await cms.users.create(
    { name: "Viewer", email: "viewer@example.com", role: "viewer", password: "viewer-pw" },
    system,
  );
  adminId = String(admin._id);
  viewerId = String(viewer._id);
  viewerCtx = { user: { id: viewerId, role: "viewer", email: "viewer@example.com" } };
});

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

const readUser = (id: string) => cms.users.findById(id, { status: "any" }, system);

const adminCtx = () => ({ user: { id: adminId, role: "admin", email: "admin@example.com" } });

/** Reads bypass the API because it strips `password` from every auth-collection result. */
const readPasswordHash = async (id: string) => {
  const rows = await db.select().from((generatedSchema as any).cmsTables.users.main);
  return String((rows as any[]).find((row) => row._id === id)?.password ?? "");
};

describe("auth collections deny by default", () => {
  it("ignores a non-admin's attempt to give itself a role", async () => {
    await cms.users.update(viewerId, { name: "Viewer Renamed", role: "admin" }, viewerCtx);

    const viewer = await readUser(viewerId);
    expect(viewer.role).toBe("viewer");
    // The rest of the update still applies — only the privileged field is dropped.
    expect(viewer.name).toBe("Viewer Renamed");
  });

  it("refuses a non-admin writing to someone else's record", async () => {
    await expect(cms.users.update(adminId, { password: "attacker-set" }, viewerCtx)).rejects.toThrow(/Access denied/);

    expect(await verifyPassword(await readPasswordHash(adminId), "admin-pw")).toBe(true);
  });

  it("refuses a non-admin creating or deleting users", async () => {
    await expect(
      cms.users.create({ name: "Mallory", email: "mallory@example.com", role: "admin" }, viewerCtx),
    ).rejects.toThrow(/Access denied/);
    await expect(cms.users.delete(adminId, viewerCtx)).rejects.toThrow(/Access denied/);

    expect(await readUser(adminId)).toBeTruthy();
  });

  it("hides other users from a non-admin's reads", async () => {
    const docs = await cms.users.find({}, viewerCtx);
    expect(docs.map((d: any) => d._id)).toEqual([viewerId]);
    expect(await cms.users.count({}, viewerCtx)).toBe(1);

    await expect(cms.users.findById(adminId, {}, viewerCtx)).rejects.toThrow(/Access denied/);
  });

  it("still lets a user change their own password", async () => {
    await cms.users.update(viewerId, { password: "self-chosen-strong-pw" }, viewerCtx);

    expect(await verifyPassword(await readPasswordHash(viewerId), "self-chosen-strong-pw")).toBe(true);
  });

  it("rejects a too-short password from a non-system caller", async () => {
    await expect(cms.users.update(viewerId, { password: "short" }, viewerCtx)).rejects.toThrow(/at least/);
  });

  it("lets an admin manage roles and other accounts", async () => {
    const adminCtx = { user: { id: adminId, role: "admin", email: "admin@example.com" } };
    await cms.users.update(viewerId, { role: "editor" }, adminCtx);

    expect((await readUser(viewerId)).role).toBe("editor");
    expect((await cms.users.find({}, adminCtx)).length).toBe(2);

    await cms.users.update(viewerId, { role: "viewer" }, adminCtx);
  });

  it("leaves non-auth collections default-allow", async () => {
    const post = await cms.posts.create({ title: "Anyone can write this" }, viewerCtx);
    expect(post._id).toBeTruthy();
  });
});

describe("field-level access rules", () => {
  // `pages.summary` declares access.read admin-only, `pages.seoDescription` access.update.
  it("omits an unreadable field from find and findById", async () => {
    const page = await cms.pages.create({ title: "Board Page", summary: "CONFIDENTIAL" }, system);

    const asViewer = await cms.pages.findById(String(page._id), { status: "any" }, viewerCtx);
    expect(asViewer.summary).toBeUndefined();
    expect(asViewer.title).toBe("Board Page");

    const listed = (await cms.pages.find({ status: "any" }, viewerCtx)).find((d: any) => d._id === page._id);
    expect(listed.summary).toBeUndefined();

    const asAdmin = await cms.pages.findById(String(page._id), { status: "any" }, adminCtx());
    expect(asAdmin.summary).toBe("CONFIDENTIAL");
  });

  it("applies a field's update rule on create, not just on update", async () => {
    const created = await cms.pages.create({ title: "No SEO For You", seoDescription: "injected" }, viewerCtx);
    expect(created.seoDescription).toBeFalsy();

    await cms.pages.update(String(created._id), { seoDescription: "still no" }, viewerCtx);
    const after = await cms.pages.findById(String(created._id), { status: "any" }, system);
    expect(after.seoDescription).toBeFalsy();
  });
});

describe("version history and translations respect read access", () => {
  it("denies both to a caller who cannot read the document", async () => {
    await expect(cms.users.versions(adminId, viewerCtx)).rejects.toThrow(/Access denied/);
    await expect(cms.users.getTranslations(adminId, viewerCtx)).rejects.toThrow(/Access denied/);
  });

  it("never exposes a password hash in a version snapshot", async () => {
    const snapshots = await cms.users.versions(viewerId, system);
    for (const entry of snapshots) {
      expect(entry.snapshot?.password).toBeUndefined();
    }
  });
});

describe("last-admin invariant", () => {
  const countAdmins = async () => {
    const rows = await db.select().from(generatedSchema.cmsUsers).where(eq(generatedSchema.cmsUsers.role, "admin"));
    return rows.length;
  };

  it("refuses to delete or demote the only admin", async () => {
    await expect(cms.users.delete(adminId, system)).rejects.toThrow(/last remaining admin/);
    await expect(cms.users.update(adminId, { role: "editor" }, system)).rejects.toThrow(/last remaining admin/);
    expect(await countAdmins()).toBe(1);
  });

  it("blocks deleteMany that would remove every admin", async () => {
    await expect(cms.users.deleteMany({}, system)).rejects.toThrow(/last remaining admin/);
    expect(await countAdmins()).toBe(1); // nothing was deleted
  });

  it("allows demoting an admin once a second admin exists", async () => {
    const second = await cms.users.create(
      { name: "Admin2", email: "admin2@example.com", role: "admin", password: "second-admin-password" },
      system,
    );
    const updated = await cms.users.update(String(second._id), { role: "editor" }, system);
    expect(updated.role).toBe("editor");
    expect(await countAdmins()).toBe(1);
  });

  it("atomically survives concurrent deletion of two admins", async () => {
    // Exactly two admins: the original plus one more.
    const extra = await cms.users.create(
      { name: "Extra", email: "extra@example.com", role: "admin", password: "extra-admin-password" },
      system,
    );
    expect(await countAdmins()).toBe(2);

    const results = await Promise.allSettled([
      cms.users.delete(adminId, system),
      cms.users.delete(String(extra._id), system),
    ]);
    // Exactly one deletion is blocked, so exactly one admin survives — never zero.
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await countAdmins()).toBe(1);
  });

  it("survives a real bulk deleteMany racing a promotion and a concurrent admin delete", async () => {
    // Reduce to exactly one admin so the scenario is unambiguous: delete() itself refuses to
    // go below one, so this loop naturally stops there regardless of how many admins survived
    // earlier tests.
    for (;;) {
      const admins = await db.select().from(generatedSchema.cmsUsers).where(eq(generatedSchema.cmsUsers.role, "admin"));
      if (admins.length <= 1) break;
      await cms.users.delete(String((admins[0] as { _id: string })._id), system).catch(() => {});
    }
    const soleAdmin = (
      await db.select().from(generatedSchema.cmsUsers).where(eq(generatedSchema.cmsUsers.role, "admin"))
    )[0] as { _id: string };
    expect(soleAdmin).toBeTruthy();

    // Keep the shared `viewerId` fixture out of the `role: "viewer"` filter below so it only
    // matches the fresh user this test creates.
    await cms.users.update(viewerId, { role: "editor" }, system);
    const promotee = await cms.users.create(
      { name: "Promotee", email: "promotee@example.com", role: "viewer", password: "promotee-password" },
      system,
    );

    // deleteMany's own id-selection SELECT will see `promotee` as a viewer (matching the
    // filter); the race is whether its actual per-row delete statement re-checks role live —
    // if promotion completes first, the guard must block it, since deleting both the promoted
    // admin and the original sole admin would zero out every admin.
    await Promise.allSettled([
      cms.users.update(String(promotee._id), { role: "admin" }, system),
      cms.users.deleteMany({ role: "viewer" }, system),
      cms.users.delete(String(soleAdmin._id), system),
    ]);

    expect(await countAdmins()).toBeGreaterThanOrEqual(1);
  });

  it("blocks a role write whose own pre-read is stale relative to a concurrent promotion", async () => {
    // Forces the exact interleaving via __testHooks, rather than hoping Promise.allSettled
    // schedules it: pause update()'s write for `v` right after its role-write decision, promote
    // `v` and remove the original admin while it's paused, then resume — the write must still
    // be blocked, since its guard checks role live in the WHERE clause, not its own stale read.
    for (;;) {
      const admins = await db.select().from(generatedSchema.cmsUsers).where(eq(generatedSchema.cmsUsers.role, "admin"));
      if (admins.length <= 1) break;
      await cms.users.delete(String((admins[0] as { _id: string })._id), system).catch(() => {});
    }
    const soleAdmin = (
      await db.select().from(generatedSchema.cmsUsers).where(eq(generatedSchema.cmsUsers.role, "admin"))
    )[0] as { _id: string };

    const v = await cms.users.create(
      { name: "V", email: "stale-read@example.com", role: "viewer", password: "stale-read-password" },
      system,
    );

    let releaseGate: () => void;
    const gate = new Promise<void>((resolve) => (releaseGate = resolve));
    let paused = false;
    __testHooks.beforeRoleWrite = async () => {
      paused = true;
      await gate;
    };

    const staleWrite = cms.users.update(String(v._id), { role: "viewer" }, system);
    while (!paused) await new Promise((r) => setTimeout(r, 0));
    __testHooks.beforeRoleWrite = null;

    await cms.users.update(String(v._id), { role: "admin" }, system);
    await cms.users.delete(String(soleAdmin._id), system);
    expect(await countAdmins()).toBe(1);

    releaseGate!();
    await expect(staleWrite).rejects.toThrow(/last remaining admin/);
    expect(await countAdmins()).toBe(1);
  });
});
