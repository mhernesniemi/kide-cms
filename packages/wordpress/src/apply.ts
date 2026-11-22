/**
 * `kide-wp apply`: write the stored plan incrementally. Unchanged documents
 * (same hash, still present) are skipped, media is uploaded once in parallel and
 * remembered, writes are batched in transactions with a savepoint per document,
 * and documents the importer created earlier but the plan no longer contains are
 * removed. Search is rebuilt once at the end.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { getSchema, getTranslatableFieldNames } from "@kidecms/core";
import { createCmsContext } from "@kidecms/core/context";
import { MEDIA_TOKEN, tokenKey } from "./plan";
import { loadPlan } from "./report";
import { getMeta, setMeta, type Staging } from "./staging";

export type ApplyReport = {
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  failed: Array<{ docId: string; message: string }>;
  /** `missing`: the source itself answers 4xx (the file was deleted); references to it are dropped. */
  media: {
    uploaded: number;
    reused: number;
    missing: Array<{ key: string; message: string }>;
    failed: Array<{ key: string; message: string }>;
  };
  durationMs: number;
};

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
};

const pool = async <T>(items: T[], size: number, run: (item: T) => Promise<void>) => {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await run(items[i++]);
    }),
  );
};

// Live sites drop the odd connection under parallel load; a 4xx is final, anything else is retried.
const download = async (url: string, attempts = 4): Promise<Uint8Array> => {
  for (let i = 1; ; i++) {
    try {
      // Generous: a large video over a slow live site is still one file.
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (res.status >= 400 && res.status < 500)
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { final: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if ((e as { final?: boolean }).final || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
};

/** Downloads are kept across projects and fresh runs, so the source site is fetched once per file. */
const mediaCache = () =>
  path.resolve(process.env.KIDE_MEDIA_CACHE ?? path.join(homedir(), ".cache", "kide", "import-media"));

// A 4xx is cached too (`.gone`), so a fresh project doesn't ask the source again; `apply --all` does.
const fetchCached = async (url: string, retryGone = false): Promise<Uint8Array> => {
  const file = path.join(mediaCache(), createHash("sha1").update(url).digest("hex"));
  const cached = await readFile(file).catch(() => null);
  if (cached) return new Uint8Array(cached);
  const gone = await readFile(`${file}.gone`, "utf8").catch(() => null);
  if (gone !== null && !retryGone) throw Object.assign(new Error(gone), { final: true });
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const bytes = await download(url);
    await writeFile(file, bytes);
    return bytes;
  } catch (e) {
    if ((e as { final?: boolean }).final) await writeFile(`${file}.gone`, (e as Error).message);
    throw e;
  }
};

const SYSTEM = { _system: true, _skipSearch: true };
const snakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

export const applyImport = async (
  staging: Staging,
  options: { force?: boolean; all?: boolean; prune?: boolean; concurrency?: number; batchSize?: number } = {},
): Promise<ApplyReport> => {
  const started = Date.now();
  const plan = loadPlan(staging);
  if (!plan) throw new Error("No plan yet — run `kide-wp plan` first.");
  if (plan.blocking.length && !options.force)
    throw new Error(
      `The plan is blocked (${plan.blocking.length} problem(s), see .kide/import/ledger.md). Fix them or pass --force.`,
    );

  const { cms, db, assets, config, reindex, dispose } = await createCmsContext();
  const drafts = new Set(config.collections.filter((c) => c.drafts).map((c) => c.slug));
  const api = cms as unknown as Record<string, any>;
  const sqlite = (db as any).$client as import("better-sqlite3").Database;
  const report: ApplyReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    deleted: 0,
    failed: [],
    media: { uploaded: 0, reused: 0, missing: [], failed: [] },
    durationMs: 0,
  };

  try {
    // A field added or made translatable without `cms:push` has no column, and writes drop it silently.
    // Compare with the config itself: the generated schema is just as stale until the push.
    const columns = (table: string) =>
      new Set((sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((c) => c.name));
    const behind: string[] = [];
    for (const slug of new Set(plan.docs.map((d) => d.collection))) {
      const collection = config.collections.find((c) => c.slug === slug);
      if (!collection) continue;
      const main = `cms_${snakeCase(slug)}`;
      const translatable = config.locales ? getTranslatableFieldNames(collection) : [];
      for (const [table, fields] of [
        [main, Object.keys(collection.fields)],
        [`${main}_translations`, translatable],
      ] as const) {
        if (!fields.length) continue;
        const have = columns(table);
        for (const field of fields) if (!have.has(snakeCase(field))) behind.push(`${table}.${snakeCase(field)}`);
      }
    }
    if (behind.length)
      throw new Error(
        `The database schema is behind the config (missing ${behind.slice(0, 5).join(", ")}). Run \`pnpm cms:push\`, then apply again.`,
      );

    const existing = new Map<string, Set<string>>();
    for (const slug of new Set([...plan.docs.map((d) => d.collection)])) {
      const main = getSchema().cmsTables[slug]?.main;
      const rows = main ? ((await db.select({ _id: main._id }).from(main)) as Array<{ _id: string }>) : [];
      existing.set(slug, new Set(rows.map((r) => r._id)));
    }
    const applied = new Map(
      (
        staging.prepare("SELECT doc_id, collection, hash FROM applied").all() as Array<{
          doc_id: string;
          collection: string;
          hash: string;
        }>
      ).map((r) => [r.doc_id, r]),
    );
    const pending = plan.docs.filter(
      (d) => options.all || applied.get(d.docId)?.hash !== d.hash || !existing.get(d.collection)?.has(d.docId),
    );
    report.unchanged = plan.docs.length - pending.length;

    // --- media -------------------------------------------------------------
    const resolved = new Map(
      (
        staging.prepare("SELECT key, storage_path FROM media_state").all() as Array<{
          key: string;
          storage_path: string;
        }>
      ).map((r) => [r.key, r.storage_path]),
    );
    const assetRows = (await db.select({ p: getSchema().cmsAssets.storagePath }).from(getSchema().cmsAssets)) as Array<{
      p: string;
    }>;
    const livePaths = new Set(assetRows.map((r) => r.p));
    for (const [key, p] of resolved) if (!livePaths.has(p)) resolved.delete(key);

    const needed = [...new Set(pending.flatMap((d) => d.media))];
    // Files the source answered 4xx for stay missing until `--all` asks again.
    const knownMissing = new Set(options.all ? [] : (JSON.parse(getMeta(staging, "missingMedia") ?? "[]") as string[]));
    const toUpload = needed.filter((k) => !resolved.has(k) && !knownMissing.has(k));
    report.media.reused = needed.length - toUpload.length;
    const uploadsDir = getMeta(staging, "uploadsDir");
    const remember = staging.prepare(
      "INSERT OR REPLACE INTO media_state (key, storage_path, applied_at) VALUES (?, ?, ?)",
    );
    await pool(toUpload, options.concurrency ?? 12, async (key) => {
      const m = plan.media[key];
      try {
        if (!m) throw new Error("not in plan");
        let bytes: Uint8Array;
        if (uploadsDir && m.file) bytes = await readFile(path.join(uploadsDir, m.file));
        else bytes = await fetchCached(m.url, options.all);
        const name = decodeURIComponent(path.basename(m.file ?? new URL(m.url).pathname));
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        const file = new File([bytes as BlobPart], name, { type: m.mime ?? MIME[ext] ?? "application/octet-stream" });
        const asset = await assets.upload(file, { alt: m.alt ?? undefined, dedupe: true });
        resolved.set(key, asset.storagePath);
        remember.run(key, asset.storagePath, new Date().toISOString());
        report.media.uploaded++;
      } catch (e) {
        const gone = (e as { final?: boolean }).final || (e as { code?: string }).code === "ENOENT";
        report.media[gone ? "missing" : "failed"].push({ key, message: (e as Error).message });
      }
    });
    const gone = new Set<string>([
      ...[...knownMissing].filter((k) => !resolved.has(k)),
      ...report.media.missing.map((m) => m.key),
    ]);
    setMeta(staging, "missingMedia", JSON.stringify([...gone]));

    // --- documents ----------------------------------------------------------
    const markApplied = staging.prepare(
      "INSERT OR REPLACE INTO applied (doc_id, collection, hash, applied_at) VALUES (?, ?, ?, ?)",
    );
    const isGone = (v: unknown) => {
      const m = typeof v === "string" ? /^\/uploads\/\.kide-media\/([A-Za-z0-9_-]+)$/.exec(v) : null;
      return !!m && gone.has(tokenKey(m[1]));
    };
    // Images go, links keep their text, media fields and link values become null.
    const dropGone = (value: unknown): unknown => {
      if (Array.isArray(value))
        return value.filter((v) => !isGone(v) && !(v?.type === "image" && isGone(v.src))).map(dropGone);
      if (!value || typeof value !== "object") return isGone(value) ? null : value;
      if (isGone((value as Record<string, unknown>).url)) return null;
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k, v]) => !(k === "href" && isGone(v)))
          .map(([k, v]) => [k, dropGone(v)]),
      );
    };
    const resolveTokens = (value: unknown) => {
      const missing: string[] = [];
      const json = JSON.stringify(gone.size ? dropGone(value) : value).replace(MEDIA_TOKEN, (_, encoded: string) => {
        const p = resolved.get(tokenKey(encoded));
        if (!p) missing.push(tokenKey(encoded));
        return p ?? "";
      });
      return { value: JSON.parse(json), missing };
    };

    const batchSize = options.batchSize ?? 100;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const done: typeof batch = [];
      sqlite.exec("BEGIN");
      try {
        for (const doc of batch) {
          const data = resolveTokens(doc.data);
          const translations = resolveTokens(doc.translations);
          const missing = [...data.missing, ...translations.missing];
          if (missing.length) {
            report.failed.push({ docId: doc.docId, message: `media not uploaded: ${missing.slice(0, 3).join(", ")}` });
            continue;
          }
          sqlite.exec("SAVEPOINT doc");
          try {
            const isNew = !existing.get(doc.collection)?.has(doc.docId);
            await api[doc.collection].upsert(data.value, SYSTEM);
            for (const [locale, overlay] of Object.entries(
              translations.value as Record<string, Record<string, unknown>>,
            ))
              await api[doc.collection].upsertTranslation(
                doc.docId,
                locale,
                {
                  // Fields the plan left out inherit the original, so clear any earlier copy.
                  ...Object.fromEntries(
                    getTranslatableFieldNames(api.meta.getCollection(doc.collection)).map((f) => [f, null]),
                  ),
                  ...overlay,
                  ...(doc.data._status === "published" ? { _status: "published" } : {}),
                },
                SYSTEM,
              );
            // Updating a published document parks the old version as its live snapshot; republish so the site shows the import.
            if (!isNew && doc.data._status === "published" && drafts.has(doc.collection))
              await api[doc.collection].publish(doc.docId, SYSTEM);
            sqlite.exec("RELEASE doc");
            if (isNew) report.created++;
            else report.updated++;
            done.push(doc);
          } catch (e) {
            sqlite.exec("ROLLBACK TO doc");
            sqlite.exec("RELEASE doc");
            report.failed.push({ docId: doc.docId, message: (e as Error).message });
          }
        }
        sqlite.exec("COMMIT");
      } catch (e) {
        if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
        throw e;
      }
      const now = new Date().toISOString();
      for (const doc of done) markApplied.run(doc.docId, doc.collection, doc.hash, now);
    }

    // --- prune --------------------------------------------------------------
    if (options.prune ?? true) {
      const planned = new Set(plan.docs.map((d) => d.docId));
      const forget = staging.prepare("DELETE FROM applied WHERE doc_id = ?");
      for (const [docId, row] of applied) {
        if (planned.has(docId)) continue;
        try {
          if (api[row.collection]) await api[row.collection].delete(docId, SYSTEM);
          forget.run(docId);
          report.deleted++;
        } catch (e) {
          report.failed.push({ docId, message: `delete failed: ${(e as Error).message}` });
        }
      }
    }

    if (report.created || report.updated || report.deleted) await reindex();
  } finally {
    await dispose();
  }
  report.durationMs = Date.now() - started;
  return report;
};
