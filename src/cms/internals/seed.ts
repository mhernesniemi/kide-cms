import { closeDb, seedDatabase } from "../core";
import { loadProjectConfig, loadProjectRuntime } from "./project";
import seedData from "./seed.data";

await loadProjectRuntime();
const config = await loadProjectConfig();

await seedDatabase(config, seedData);
// Release the DB / local platform proxy so the process can exit (matters on the
// Cloudflare target, where the binding proxy otherwise keeps Node alive).
await closeDb();
