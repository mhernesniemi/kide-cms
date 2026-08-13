import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as generatedSchema from "./fixtures/project/src/cms/.generated/schema";
import { createPasswordReset, consumePasswordReset, hashToken } from "../auth";
import { clearRateLimit, hitRateLimit, peekRateLimit, recordRateLimit } from "../rate-limit";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
  });
});

afterEach(() => vi.useRealTimers());
afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("hitRateLimit (increment-and-check)", () => {
  it("allows up to max within a window, then blocks", async () => {
    const opts = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) expect((await hitRateLimit("t1", "k", opts)).ok).toBe(true);
    const blocked = await hitRateLimit("t1", "k", opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const opts = { max: 1, windowMs: 1000 };
    expect((await hitRateLimit("t2", "k", opts)).ok).toBe(true);
    expect((await hitRateLimit("t2", "k", opts)).ok).toBe(false);
    vi.setSystemTime(1500); // past the window
    expect((await hitRateLimit("t2", "k", opts)).ok).toBe(true);
  });

  it("keeps separate buckets and keys independent", async () => {
    const opts = { max: 1, windowMs: 60_000 };
    expect((await hitRateLimit("t3", "a", opts)).ok).toBe(true);
    expect((await hitRateLimit("t3", "b", opts)).ok).toBe(true); // different key
    expect((await hitRateLimit("t4", "a", opts)).ok).toBe(true); // different bucket
  });
});

describe("peek / record / clear (login failure budget)", () => {
  const opts = { max: 2, windowMs: 60_000 };

  it("peek never increments — repeated peeks stay ok", async () => {
    for (let i = 0; i < 5; i++) expect((await peekRateLimit("p1", "k", opts)).ok).toBe(true);
  });

  it("blocks only after enough recorded failures, and clear resets the budget", async () => {
    expect((await peekRateLimit("p2", "k", opts)).ok).toBe(true);
    await recordRateLimit("p2", "k", opts);
    await recordRateLimit("p2", "k", opts); // 2 failures == max
    expect((await peekRateLimit("p2", "k", opts)).ok).toBe(false); // now blocked
    await clearRateLimit("p2", "k"); // e.g. a successful login clears the account budget
    expect((await peekRateLimit("p2", "k", opts)).ok).toBe(true);
  });
});

describe("atomic single-use token consumption", () => {
  it("lets exactly one of two concurrent consumers win", async () => {
    const { token } = await createPasswordReset("user-x");
    const [a, b] = await Promise.all([consumePasswordReset(token), consumePasswordReset(token)]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.userId).toBe("user-x");
  });

  it("returns null for an already-consumed token", async () => {
    const { token } = await createPasswordReset("user-y");
    expect((await consumePasswordReset(token))?.userId).toBe("user-y");
    expect(await consumePasswordReset(token)).toBeNull();
  });

  it("stores reset tokens hashed, not raw", async () => {
    const { token } = await createPasswordReset("user-z");
    const schema = generatedSchema as never as { cmsPasswordResets: any };
    const db = drizzle(sqlite);
    const { eq } = await import("drizzle-orm");
    const raw = await db.select().from(schema.cmsPasswordResets).where(eq(schema.cmsPasswordResets.token, token));
    expect(raw).toHaveLength(0);
    const hashed = await db
      .select()
      .from(schema.cmsPasswordResets)
      .where(eq(schema.cmsPasswordResets.token, await hashToken(token)));
    expect(hashed).toHaveLength(1);
  });
});
