import { reindexAll } from "@/cms/core";

import "./runtime";
import { closeDb } from "../adapters/db";
import config from "../cms.config";

const locales = config.locales?.supported ?? [];
const { indexed } = await reindexAll(config.collections, locales);
console.log(`[search] reindexed ${indexed} document${indexed === 1 ? "" : "s"}`);
// Release the DB / local platform proxy so the process can exit (Cloudflare target).
await closeDb();
