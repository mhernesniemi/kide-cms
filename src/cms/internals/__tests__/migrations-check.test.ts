import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateSQLiteDrizzleJson } from "drizzle-kit/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pendingMigrationStatements } from "../migrations-check";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kide-mig-check-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const commitSnapshot = async (schema: Record<string, unknown>) => {
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(path.join(dir, "meta", "0000_snapshot.json"), JSON.stringify(await generateSQLiteDrizzleJson(schema)));
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries: [{ idx: 0, when: 1, tag: "0000_init" }] }),
  );
};

describe("pendingMigrationStatements", () => {
  it("is empty when the schema matches the latest snapshot", async () => {
    const schema = { pages: sqliteTable("cms_pages", { _id: text("_id").primaryKey() }) };
    await commitSnapshot(schema);
    expect(await pendingMigrationStatements(schema, dir)).toEqual([]);
  });

  it("reports the statements a schema change still needs", async () => {
    await commitSnapshot({ pages: sqliteTable("cms_pages", { _id: text("_id").primaryKey() }) });
    const changed = { pages: sqliteTable("cms_pages", { _id: text("_id").primaryKey(), title: text("title") }) };
    const statements = await pendingMigrationStatements(changed, dir);
    expect(statements.join("\n")).toMatch(/ALTER TABLE `cms_pages` ADD `title`/);
  });

  it("fails without a migrations folder", async () => {
    await expect(pendingMigrationStatements({}, dir)).rejects.toThrow(/No migrations/);
  });
});
