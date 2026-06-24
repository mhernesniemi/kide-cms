import { seedDatabase } from "@/cms/core";

import "./runtime";
import { closeDb } from "../adapters/db";
import config from "../cms.config";
import seedData from "./seed.data";

await seedDatabase(config, seedData);
// Release the DB / local platform proxy so the process can exit (matters on the
// Cloudflare target, where the binding proxy otherwise keeps Node alive).
await closeDb();
