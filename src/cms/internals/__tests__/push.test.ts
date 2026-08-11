import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end tests for the cms:push safety gates, spawning the real script against a
 * throwaway DB. Slower than unit tests, but every gate here exists because a
 * plausible-looking check previously passed tests while failing in production.
 */
const SPAWN_TIMEOUT = 60_000;
let tmp: string;
let dbPath: string;

function push(args: string[] = [], env: Record<string, string> = {}) {
  try {
    const out = execFileSync("node", ["--import", "tsx", "src/cms/internals/push.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, CMS_DATABASE_URL: dbPath, ...env },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const columns = (table: string) => {
  const db = new Database(dbPath);
  const names = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
  db.close();
  return names;
};

const exec = (sql: string) => {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF"); // tests fabricate invalid states on purpose
  db.exec(sql);
  db.close();
};

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "kide-push-"));
  dbPath = path.join(tmp, "test.db");
  const initial = push();
  expect(initial.code).toBe(0);
}, SPAWN_TIMEOUT);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("cms:push safety gates", () => {
  it(
    "refuses a destructive diff without approval",
    () => {
      exec("ALTER TABLE cms_pages ADD COLUMN stray_col text;");
      const result = push();
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/Refusing to apply/);
      expect(columns("cms_pages")).toContain("stray_col");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not treat ALLOW_DATA_LOSS=false as approval",
    () => {
      const result = push([], { ALLOW_DATA_LOSS: "false" });
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/Refusing to apply/);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "applies the destructive diff with --allow-data-loss",
    () => {
      const result = push(["--allow-data-loss"]);
      expect(result.code).toBe(0);
      expect(columns("cms_pages")).not.toContain("stray_col");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses --recreate without approval, before dropping anything",
    () => {
      exec("INSERT INTO cms_pages (_id, title, _status, _created_at, _updated_at) VALUES ('t1','Keep','draft','2026-01-01','2026-01-01');");
      const result = push([], { RECREATE: "pages" });
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/Refusing --recreate/);
      const db = new Database(dbPath);
      expect((db.prepare("SELECT COUNT(*) AS n FROM cms_pages").get() as { n: number }).n).toBe(1);
      db.close();
    },
    SPAWN_TIMEOUT,
  );

  it(
    "rolls back the whole transaction when foreign_key_check fails",
    () => {
      // Dangling versions row (FKs are off) + a column dropped out-of-band: the next push
      // wants to re-ADD the column, opens its transaction, then must roll back on the check.
      exec("INSERT INTO cms_pages_versions (_id, _doc_id, _version, _snapshot, _created_at) VALUES ('v1','missing-doc',1,'{}','2026-01-01');");
      exec("ALTER TABLE cms_pages DROP COLUMN summary;");
      const result = push();
      expect(result.code).toBe(1);
      expect(result.out).toMatch(/foreign_key_check failed/);
      expect(columns("cms_pages")).not.toContain("summary");
    },
    SPAWN_TIMEOUT,
  );
});
