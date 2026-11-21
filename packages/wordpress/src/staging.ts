import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const importDir = () => path.resolve(process.env.KIDE_IMPORT_DIR ?? path.join(process.cwd(), ".kide", "import"));

export type Staging = InstanceType<typeof Database>;

export type StagedRecord = {
  key: string;
  type: string;
  id: number;
  status: string;
  locale?: string;
  group?: string;
  [field: string]: unknown;
};

export type StagedMedia = {
  key: string;
  attachmentId: number | null;
  file: string | null;
  url: string;
  mime: string | null;
  alt: string | null;
};

const SOURCE_TABLES = ["records", "media", "source_meta"];

export const openStaging = (dir = importDir()): Staging => {
  mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "staging.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, type TEXT, data TEXT);
    CREATE TABLE IF NOT EXISTS media (key TEXT PRIMARY KEY, attachment_id INTEGER, file TEXT, url TEXT, mime TEXT, alt TEXT);
    CREATE TABLE IF NOT EXISTS plan_docs (doc_id TEXT PRIMARY KEY, collection TEXT, source_keys TEXT, hash TEXT, data TEXT, translations TEXT, expected TEXT, media TEXT);
    CREATE TABLE IF NOT EXISTS plan_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS applied (doc_id TEXT PRIMARY KEY, collection TEXT, hash TEXT, applied_at TEXT);
    CREATE TABLE IF NOT EXISTS media_state (key TEXT PRIMARY KEY, storage_path TEXT, applied_at TEXT);
  `);
  const planColumns = db.prepare("PRAGMA table_info(plan_docs)").all() as Array<{ name: string }>;
  if (!planColumns.some((c) => c.name === "text_match")) db.exec("ALTER TABLE plan_docs ADD COLUMN text_match TEXT");
  return db;
};

/** Re-scouting replaces the source snapshot but keeps what was already applied, so re-runs stay incremental. */
export const resetSource = (db: Staging) => {
  for (const table of SOURCE_TABLES) db.exec(`DELETE FROM ${table}`);
  db.exec("DROP TABLE IF EXISTS plan_docs_old");
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raw_%'").all() as Array<{
    name: string;
  }>)
    db.exec(`DROP TABLE "${t.name}"`);
};

export const getMeta = (db: Staging, key: string): string | undefined =>
  (db.prepare("SELECT value FROM source_meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;

export const setMeta = (db: Staging, key: string, value: string) =>
  db.prepare("INSERT OR REPLACE INTO source_meta (key, value) VALUES (?, ?)").run(key, value);

export const loadRecords = (db: Staging): StagedRecord[] =>
  (db.prepare("SELECT data FROM records ORDER BY type, key").all() as Array<{ data: string }>).map((r) =>
    JSON.parse(r.data),
  );

export const loadMedia = (db: Staging): StagedMedia[] =>
  (db.prepare("SELECT * FROM media").all() as Array<Record<string, any>>).map((r) => ({
    key: r.key,
    attachmentId: r.attachment_id,
    file: r.file,
    url: r.url,
    mime: r.mime,
    alt: r.alt,
  }));
