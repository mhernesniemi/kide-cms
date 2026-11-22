import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, baselineMigrations } from "../migrate";

let dir: string;
let sqlite: InstanceType<typeof Database>;

const writeMigrations = (sql: string) => {
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(path.join(dir, "0000_init.sql"), sql);
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [{ idx: 0, version: "6", when: 1700000000000, tag: "0000_init", breakpoints: true }],
    }),
  );
};

const tables = () =>
  sqlite.prepare("select name from sqlite_master where type = 'table' order by name").pluck().all() as string[];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kide-mig-"));
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("applyMigrations", () => {
  it("applies pending migrations once and restores foreign_keys", () => {
    writeMigrations("CREATE TABLE `cms_users` (`_id` text PRIMARY KEY NOT NULL);");
    applyMigrations(sqlite, dir);
    applyMigrations(sqlite, dir);
    expect(tables()).toEqual(["__drizzle_migrations", "cms_users"]);
    expect(sqlite.prepare("select count(*) from __drizzle_migrations").pluck().get()).toBe(1);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("explains a missing migrations folder", () => {
    expect(() => applyMigrations(sqlite, dir)).toThrow(/db:generate/);
  });

  it("points a cms:push-synced database at --baseline instead of failing on CREATE TABLE", () => {
    writeMigrations("CREATE TABLE `cms_users` (`_id` text PRIMARY KEY NOT NULL);");
    sqlite.exec("CREATE TABLE cms_users (_id text PRIMARY KEY NOT NULL)");
    expect(() => applyMigrations(sqlite, dir)).toThrow(/--baseline/);
  });
});

describe("baselineMigrations", () => {
  it("marks migrations applied without running them, then later ones apply normally", () => {
    writeMigrations("CREATE TABLE `cms_users` (`_id` text PRIMARY KEY NOT NULL);");
    sqlite.exec("CREATE TABLE cms_users (_id text PRIMARY KEY NOT NULL)");
    expect(baselineMigrations(sqlite, dir)).toBe(1);
    expect(() => applyMigrations(sqlite, dir)).not.toThrow();
    expect(() => baselineMigrations(sqlite, dir)).toThrow(/already tracks/);
  });
});
