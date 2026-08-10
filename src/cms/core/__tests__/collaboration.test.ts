import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "@/cms/.generated/schema";
import { collaboration } from "../collaboration";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;

const author = { id: "user-a", email: "a@example.com", role: "editor" };

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

afterAll(() => {
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("collaboration core", () => {
  it("defaults to in_progress and records review-state transitions", async () => {
    expect((await collaboration.getState("posts", "doc1")).reviewState).toBe("in_progress");
    await collaboration.setReviewState("posts", "doc1", "ready_for_review", author);
    expect((await collaboration.getState("posts", "doc1")).reviewState).toBe("ready_for_review");
    await collaboration.setReviewState("posts", "doc1", "approved", author);
    expect((await collaboration.getState("posts", "doc1")).reviewState).toBe("approved");
  });

  it("rejects an invalid review state", async () => {
    await expect(collaboration.setReviewState("posts", "doc1", "bogus" as never, author)).rejects.toThrow(
      /Invalid review state/,
    );
  });

  it("round-trips a comment through getComment and delete", async () => {
    const created = await collaboration.addComment("posts", "doc2", { body: "needs work", field: null }, author);
    const fetched = await collaboration.getComment(created._id);
    expect(fetched).toMatchObject({ _id: created._id, collection: "posts", documentId: "doc2", authorId: "user-a" });

    await collaboration.deleteComment(created._id, author);
    expect(await collaboration.getComment(created._id)).toBeNull();
  });

  it("returns null from getComment for an unknown id", async () => {
    expect(await collaboration.getComment("does-not-exist")).toBeNull();
  });
});
