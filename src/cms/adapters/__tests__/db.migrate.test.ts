import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "../db";

/**
 * Drives the real drizzle migrate() through getDb() against a throwaway cwd, so the
 * assertion is "a broken migration actually surfaces", not "a string matcher matches".
 */
let tmp: string;
const cwd = process.cwd();
const nodeEnv = process.env.NODE_ENV;
const dbUrl = process.env.CMS_DATABASE_URL;

function writeMigration(sql: string) {
  const dir = path.join(tmp, "src/cms/migrations");
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(path.join(dir, "0000_test.sql"), sql);
  writeFileSync(
    path.join(dir, "meta/_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [{ idx: 0, version: "6", when: 1, tag: "0000_test", breakpoints: true }],
    }),
  );
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "kide-db-"));
  process.env.CMS_DATABASE_URL = path.join(tmp, "test.db");
  process.chdir(tmp);
});

afterEach(() => {
  closeDb();
  process.chdir(cwd);
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (dbUrl === undefined) delete process.env.CMS_DATABASE_URL;
  else process.env.CMS_DATABASE_URL = dbUrl;
  rmSync(tmp, { recursive: true, force: true });
});

describe("getDb migration handling", () => {
  it("aborts startup in production when a migration is broken", async () => {
    process.env.NODE_ENV = "production";
    writeMigration("CRETE TABLE broken (id text);");
    await expect(getDb()).rejects.toThrow(/migration failed; refusing to start/);
  });

  it("starts normally when migrations are valid", async () => {
    process.env.NODE_ENV = "production";
    writeMigration("CREATE TABLE ok (id text);");
    await expect(getDb()).resolves.toBeTruthy();
  });

  it("tolerates a broken migration in development", async () => {
    process.env.NODE_ENV = "development";
    writeMigration("CRETE TABLE broken (id text);");
    await expect(getDb()).resolves.toBeTruthy();
  });

  it("tolerates a table `drizzle-kit push` already created, outside development (e.g. standalone cms:seed)", async () => {
    delete process.env.NODE_ENV;
    writeMigration("CREATE TABLE already_pushed (id text);");
    const sqlite = new Database(path.join(tmp, "test.db"));
    sqlite.exec("CREATE TABLE already_pushed (id text);");
    sqlite.close();

    await expect(getDb()).resolves.toBeTruthy();
  });
});
