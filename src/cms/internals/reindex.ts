import { closeDb, reindexAll } from "../core";
import { loadProjectConfig, loadProjectRuntime } from "./project";

await loadProjectRuntime();
const config = await loadProjectConfig();

const locales = config.locales?.supported ?? [];
const { indexed } = await reindexAll(config.collections, locales);
console.log(`[search] reindexed ${indexed} document${indexed === 1 ? "" : "s"}`);
// Release the DB / local platform proxy so the process can exit (Cloudflare target).
await closeDb();
