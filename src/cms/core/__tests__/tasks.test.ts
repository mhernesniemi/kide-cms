/**
 * Durable task/outbox tests: real generated schema (cms_outbox) on an
 * in-memory SQLite DB. Covers enqueue/drain, retry backoff, terminal failure,
 * concurrent-claim safety, dedupe keys, schedule ticks, and pruning.
 */
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as generatedSchema from "./fixtures/project/src/cms/.generated/schema";
import type { CMSConfig } from "../define";
import { drainTasks, enqueueTask, pruneTasks, tickSchedules } from "../tasks";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

const outbox = (generatedSchema as Record<string, any>).cmsOutbox;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

const configWith = (integrations: CMSConfig["integrations"]): CMSConfig => ({
  collections: [],
  integrations,
});

const allRows = () => db.select().from(outbox).all() as Array<Record<string, unknown>>;

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
});

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

beforeEach(() => {
  sqlite.exec("DELETE FROM cms_outbox");
});

describe("enqueueTask", () => {
  it("inserts a pending task due immediately", async () => {
    const id = await enqueueTask("demo.task", { hello: "world" });
    expect(id).toBeTruthy();

    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("demo.task");
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(0);
    expect(JSON.parse(String(rows[0].payload))).toEqual({ hello: "world" });
    expect(Number(rows[0].nextAttemptAt)).toBeLessThanOrEqual(Date.now());
  });

  it("respects delayMs", async () => {
    await enqueueTask("demo.task", null, { delayMs: 60_000 });
    const rows = allRows();
    expect(Number(rows[0].nextAttemptAt)).toBeGreaterThan(Date.now() + 30_000);
  });

  it("dedupes against an existing pending task with the same key", async () => {
    const first = await enqueueTask("demo.task", { n: 1 }, { dedupeKey: "demo" });
    const second = await enqueueTask("demo.task", { n: 2 }, { dedupeKey: "demo" });
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(allRows()).toHaveLength(1);
  });

  it("does not dedupe against done tasks", async () => {
    const id = await enqueueTask("demo.task", null, { dedupeKey: "demo" });
    await db.update(outbox).set({ status: "done" }).where(eq(outbox._id, id));
    const second = await enqueueTask("demo.task", null, { dedupeKey: "demo" });
    expect(second).toBeTruthy();
    expect(allRows()).toHaveLength(2);
  });
});

describe("drainTasks", () => {
  it("runs the registered handler and marks the task done", async () => {
    const seen: unknown[] = [];
    const config = configWith({
      tasks: {
        "demo.task": async (payload) => {
          seen.push(payload);
        },
      },
    });

    await enqueueTask("demo.task", { n: 42 });
    const result = await drainTasks(config);

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(seen).toEqual([{ n: 42 }]);
    const rows = allRows();
    expect(rows[0].status).toBe("done");
    expect(rows[0].lastError).toBeNull();
  });

  it("retries a throwing handler with backoff, then fails at maxAttempts", async () => {
    let calls = 0;
    const config = configWith({
      tasks: {
        "demo.task": async () => {
          calls++;
          throw new Error("boom");
        },
      },
    });

    await enqueueTask("demo.task", null, { maxAttempts: 2 });

    const first = await drainTasks(config);
    expect(first).toEqual({ processed: 1, succeeded: 0, failed: 0 });
    let rows = allRows();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toBe("boom");
    // Backed off — not due yet, so a second drain right away is a no-op.
    expect(Number(rows[0].nextAttemptAt)).toBeGreaterThan(Date.now());
    expect(await drainTasks(config)).toEqual({ processed: 0, succeeded: 0, failed: 0 });

    // Force the retry due now.
    await db
      .update(outbox)
      .set({ nextAttemptAt: Date.now() - 1000 })
      .where(eq(outbox._id, rows[0]._id));
    const second = await drainTasks(config);
    expect(second).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    rows = allRows();
    expect(rows[0].status).toBe("failed");
    expect(rows[0].attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("treats a missing handler as a retryable failure", async () => {
    const config = configWith({ tasks: {} });
    await enqueueTask("unknown.task");
    const result = await drainTasks(config);
    expect(result).toEqual({ processed: 1, succeeded: 0, failed: 0 });
    const rows = allRows();
    expect(rows[0].status).toBe("pending");
    expect(String(rows[0].lastError)).toMatch(/No task handler/);
  });

  it("claim guard rejects a stale attempts snapshot (concurrent drain safety)", async () => {
    const id = await enqueueTask("demo.task");

    // Two drains that both read the row at attempts=0 race on the same
    // guarded claim; only the first may win.
    const claim = (attemptsSnapshot: number) =>
      db
        .update(outbox)
        .set({ attempts: attemptsSnapshot + 1, nextAttemptAt: Date.now() + 5 * 60_000 })
        .where(and(eq(outbox._id, id), eq(outbox.status, "pending"), eq(outbox.attempts, attemptsSnapshot)))
        .returning({ _id: outbox._id });

    expect(await claim(0)).toHaveLength(1);
    expect(await claim(0)).toHaveLength(0);
  });

  it("passes the config through to the handler context", async () => {
    let receivedConfig: CMSConfig | null = null;
    const config = configWith({
      tasks: {
        "demo.task": async (_payload, context) => {
          receivedConfig = context.config;
        },
      },
    });

    await enqueueTask("demo.task");
    await drainTasks(config);
    expect(receivedConfig).toBe(config);
  });
});

describe("tickSchedules", () => {
  it("enqueues a scheduled task when none has run yet", async () => {
    const config = configWith({
      schedules: [{ task: "sync.demo", payload: { locale: "fi" }, everyMinutes: 10 }],
    });

    const scheduled = await tickSchedules(config);
    expect(scheduled).toBe(1);
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("sync.demo");
    expect(String(rows[0].dedupeKey)).toBe('schedule:sync.demo:{"locale":"fi"}');
  });

  it("does not re-enqueue within the interval", async () => {
    const config = configWith({
      schedules: [{ task: "sync.demo", everyMinutes: 10 }],
    });

    expect(await tickSchedules(config)).toBe(1);
    expect(await tickSchedules(config)).toBe(0);
    expect(allRows()).toHaveLength(1);
  });

  it("re-enqueues once the interval has elapsed and the previous run is finished", async () => {
    const config = configWith({
      schedules: [{ task: "sync.demo", everyMinutes: 10 }],
    });

    await tickSchedules(config);
    const stale = Date.now() - 11 * 60_000;
    await db.update(outbox).set({ status: "done", createdAt: stale }).where(eq(outbox.type, "sync.demo"));

    expect(await tickSchedules(config)).toBe(1);
    expect(allRows()).toHaveLength(2);
  });

  it("keeps distinct payloads on distinct schedules apart", async () => {
    const config = configWith({
      schedules: [
        { task: "sync.demo", payload: { locale: "fi" }, everyMinutes: 10 },
        { task: "sync.demo", payload: { locale: "en" }, everyMinutes: 10 },
      ],
    });

    expect(await tickSchedules(config)).toBe(2);
    expect(allRows()).toHaveLength(2);
  });
});

describe("pruneTasks", () => {
  it("removes old done and failed tasks but keeps pending ones", async () => {
    const doneId = await enqueueTask("a");
    const failedId = await enqueueTask("b");
    await enqueueTask("c");

    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await db.update(outbox).set({ status: "done", updatedAt: old }).where(eq(outbox._id, doneId));
    await db.update(outbox).set({ status: "failed", updatedAt: old }).where(eq(outbox._id, failedId));

    await pruneTasks();
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.status)).toEqual(["pending"]);
  });

  it("keeps a recently-failed task (payload may still be needed for debugging)", async () => {
    const failedId = await enqueueTask("b");
    await db.update(outbox).set({ status: "failed", updatedAt: Date.now() }).where(eq(outbox._id, failedId));

    await pruneTasks();
    const rows = allRows();
    expect(rows.find((row) => row._id === failedId)?.status).toBe("failed");
  });
});
