/**
 * Webhook durability: dispatchWebhooks enqueues a durable outbox reference — never the resolved
 * URL/headers/body — so a webhook's secret header is never persisted, and delivery re-resolves
 * the live config (URL, headers, payload) at drain time.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as generatedSchema from "@/cms/.generated/schema";
import { createCms } from "../api";
import type { CMSConfig } from "../define";
import { runWithRequestScope } from "../request-scope";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { resetSchema, initSchema } from "../schema";
import { drainTasks, enqueueTask } from "../tasks";
import { dispatchWebhooks } from "../webhooks";

const outbox = (generatedSchema as Record<string, any>).cmsOutbox;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

const SECRET = "Bearer super-secret-token";

const config: CMSConfig = {
  collections: [],
  admin: {
    webhooks: [
      {
        name: "notify",
        url: "https://example.test/hook",
        events: ["create"],
        headers: { Authorization: SECRET },
      },
    ],
  },
};

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
  });
});

beforeEach(async () => db.delete(outbox));
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("dispatchWebhooks", () => {
  it("enqueues a reference without the webhook's secret header anywhere in the row", async () => {
    await runWithRequestScope({ defer: () => {} }, async () => {
      dispatchWebhooks(config, "create", "posts", { _id: "doc-1", title: "hi" }, null);
      // dispatchWebhooks fires the enqueue via a tracked (deferred-but-immediate) promise; give
      // the microtask queue a turn so the insert lands before we inspect the table.
      await new Promise((r) => setTimeout(r, 0));
    });

    const rows = await db.select().from(outbox).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("webhook.deliver");
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain("Authorization");
    const payload = JSON.parse(String(rows[0].payload));
    expect(payload).toEqual({
      webhookName: "notify",
      event: "create",
      collection: "posts",
      doc: { _id: "doc-1", title: "hi" },
      user: null,
      timestamp: expect.any(String),
    });
  });

  it("resolves the live webhook config (URL + headers) at delivery time", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await enqueueTask("webhook.deliver", {
      webhookName: "notify",
      event: "create",
      collection: "posts",
      doc: { _id: "doc-2" },
      user: null,
      timestamp: new Date().toISOString(),
    });
    const result = await drainTasks(config);

    expect(result.succeeded).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.test/hook",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: SECRET }) }),
    );
  });

  it("drops delivery quietly when the webhook was removed from config since enqueue", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await enqueueTask("webhook.deliver", {
      webhookName: "no-longer-configured",
      event: "create",
      collection: "posts",
      doc: {},
      user: null,
      timestamp: new Date().toISOString(),
    });
    const result = await drainTasks(config);

    expect(result.succeeded).toBe(1); // handler returns cleanly, no retry storm
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes to the correct endpoint when webhook names are unique", async () => {
    const twoWebhooks: CMSConfig = {
      collections: [],
      admin: {
        webhooks: [
          { name: "first", url: "https://one.test/hook", events: ["create"] },
          { name: "second", url: "https://two.test/hook", events: ["create"] },
        ],
      },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await runWithRequestScope({ defer: () => {} }, async () => {
      dispatchWebhooks(twoWebhooks, "create", "posts", { _id: "doc-3" }, null);
      await new Promise((r) => setTimeout(r, 0));
    });
    const result = await drainTasks(twoWebhooks);

    expect(result.succeeded).toBe(2);
    const urls = fetchSpy.mock.calls.map((call) => call[0]);
    expect(urls.sort()).toEqual(["https://one.test/hook", "https://two.test/hook"]);
  });
});

describe("createCms", () => {
  it("rejects a config with duplicate webhook names", () => {
    const duplicated: CMSConfig = {
      collections: [],
      admin: {
        webhooks: [
          { name: "notify", url: "https://one.test/hook", events: ["create"] },
          { name: "notify", url: "https://two.test/hook", events: ["update"] },
        ],
      },
    };
    expect(() => createCms(duplicated)).toThrow(/[Dd]uplicate webhook name/);
  });

  it("rejects blank webhook names, including duplicate blanks", () => {
    const blank: CMSConfig = {
      collections: [],
      admin: { webhooks: [{ name: "", url: "https://one.test/hook", events: ["create"] }] },
    };
    expect(() => createCms(blank)).toThrow(/blank name/);

    const twoBlanks: CMSConfig = {
      collections: [],
      admin: {
        webhooks: [
          { name: "", url: "https://one.test/hook", events: ["create"] },
          { name: "  ", url: "https://two.test/hook", events: ["update"] },
        ],
      },
    };
    expect(() => createCms(twoBlanks)).toThrow(/blank name/);
  });
});
