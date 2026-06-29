/**
 * Bootstrap the CMS for a standalone Node script — migrations, seeds, one-off
 * maintenance — run via `node --import tsx scripts/<file>.ts`.
 *
 * Importing this module wires the runtime (DB / storage / email adapters) as a
 * side effect through `./runtime`, so you don't have to remember the import-order
 * dance. `createCmsContext()` then hands back the typed API plus the handles a
 * script usually needs.
 *
 *   import { createCmsContext } from "@/cms/internals/context";
 *
 *   const { cms, assets, flush, dispose } = await createCmsContext();
 *   await cms.posts.create({ title: "…" }, { _system: true, _skipSearch: true });
 *   await flush();    // drain fire-and-forget search/audit tasks before exit
 *   await dispose();  // flush + close the DB connection
 *
 * For bulk imports, pass `{ _system: true, _skipSearch: true }` to writes and
 * call `reindexAll()` once at the end instead of indexing per document.
 */
import "./runtime"; // side effect: configureCmsRuntime()
import { assets, closeDb, createCms, ensureSearchSchema, flushTasks, folders, getDb, reindexAll } from "@/cms/core";
import config from "@/cms/cms.config";

export const createCmsContext = async () => {
  const cms = createCms(config);
  const db = await getDb();
  return {
    /** Typed local API: `cms.posts.create(...)`, `cms.pages.deleteMany(...)`, … */
    cms,
    /** Drizzle instance for the dev SQLite database (escape hatch). */
    db,
    /** Asset store: `assets.upload(file, { alt })`. */
    assets,
    folders,
    /** The resolved CMS config. */
    config,
    /** Rebuild the search index for all searchable collections. */
    reindexAll,
    /** Create the FTS search schema if missing (call before indexing). */
    ensureSearchSchema,
    /** Await all fire-and-forget search/audit tasks queued so far. */
    flush: flushTasks,
    /** Flush pending tasks, then close the database connection. */
    dispose: async () => {
      await flushTasks();
      closeDb();
    },
  };
};
