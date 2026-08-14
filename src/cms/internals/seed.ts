import { closeDb, seedDatabase } from "../core";
import { loadProjectConfig, loadProjectRuntime, loadProjectSeedData } from "./project";

await loadProjectRuntime();
const config = await loadProjectConfig();
const seedData = await loadProjectSeedData();

if (Object.keys(seedData).length === 0) {
  console.log("No seed content found. Define documents in src/cms/seed.ts (default export keyed by collection slug).");
} else {
  await seedDatabase(config, seedData);
}
// Release the DB / local platform proxy so the process can exit (matters on the
// Cloudflare target, where the binding proxy otherwise keeps Node alive).
await closeDb();
