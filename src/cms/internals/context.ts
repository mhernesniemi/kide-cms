/**
 * Bootstrap the CMS for a standalone Node script — migrations, seeds, one-off
 * maintenance — run via `node --import tsx scripts/<file>.ts`.
 *
 * `createCmsContext()` wires the runtime (DB / storage / email adapters) by
 * loading the project's `src/cms/runtime.ts`, so you don't have to remember the
 * import-order dance. It then hands back the typed API plus the handles a
 * script usually needs.
 *
 *   import { createCmsContext } from "@kidecms/core/context";
 *
 *   const { cms, assets, flush, dispose } = await createCmsContext();
 *   await cms.posts.create({ title: "…" }, { _system: true, _skipSearch: true });
 *   await flush();    // drain fire-and-forget search/audit tasks before exit
 *   await dispose();  // flush + close the DB connection
 *
 * For bulk imports, pass `{ _system: true, _skipSearch: true }` to writes and
 * call `reindex()` once at the end instead of indexing per document.
 */
import {
  assets,
  closeDb,
  createCms,
  describeModel,
  ensureSearchSchema,
  flushTasks,
  folders,
  getDb,
  importDocuments,
  reindexAll,
  type ImportItem,
} from "../core";
import { loadProjectConfig, loadProjectRuntime } from "./project";

export const createCmsContext = async () => {
  await loadProjectRuntime(); // side effect: configureCmsRuntime()
  const config = await loadProjectConfig();
  const cms = createCms(config);
  const db = await getDb();
  return {
    /** Typed local API: `cms.posts.create(...)`, `cms.pages.deleteMany(...)`, … */
    cms,
    /** Drizzle instance for the dev SQLite database (escape hatch). */
    db,
    /** Asset store: `assets.upload(file, { alt, dedupe })`. */
    assets,
    folders,
    /** The resolved CMS config. */
    config,
    /** Validate + create a batch of documents. Pass `{ dryRun: true }` for a report only. */
    load: (items: ImportItem[], options?: { dryRun?: boolean; context?: Record<string, unknown> }) =>
      importDocuments(cms as Record<string, any>, config, items, options),
    /** The machine-readable content model (same as `.kide/model.json`). */
    model: () => describeModel(config),
    /** Rebuild the search index for all searchable collections (uses this config's locales). */
    reindex: () => reindexAll(config.collections, config.locales?.supported ?? []),
    /** Create the FTS search schema if missing (call before indexing). */
    ensureSearchSchema,
    /** Await all fire-and-forget search/audit tasks queued so far. */
    flush: flushTasks,
    /** Flush pending tasks, then close the database connection. */
    dispose: async () => {
      await flushTasks();
      await closeDb();
    },
  };
};
