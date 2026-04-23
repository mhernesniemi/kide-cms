import { reindexAll } from "@/cms/core";

import "./runtime";
import config from "../cms.config";

const locales = config.locales?.supported ?? [];
const { indexed } = await reindexAll(config.collections, locales);
console.log(`[search] reindexed ${indexed} document${indexed === 1 ? "" : "s"}`);
