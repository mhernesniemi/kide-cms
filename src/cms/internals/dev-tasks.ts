import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, watch, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Host-independent build/dev chores every host integration runs: code generation on
// startup, and in dev, database setup plus regeneration when the schema changes.

const packageRoot = path.dirname(realpathSync(path.dirname(fileURLToPath(import.meta.url))));
const packagePath = (...segments: string[]) => path.join(packageRoot, ...segments);
const requireFromPackage = createRequire(import.meta.url);

export const defaultGeneratorPath = packagePath("internals", "generator.ts");

// The runner scripts live in this package but read the project from cwd. tsx is
// a dependency of this package, so resolve its entry absolutely — the project
// itself may not depend on it.
const tsxEntry = requireFromPackage.resolve("tsx");

function runScript(cwd: string, scriptPath: string) {
  execFileSync(process.execPath, ["--import", tsxEntry, scriptPath], {
    stdio: "inherit",
    cwd,
  });
}

// D1 dev syncs via drizzle-kit against miniflare's sqlite (located by the CF drizzle
// config); the Node target goes through the guarded cms:push script — same gates as CI/deploy.
function pushSchema(cwd: string, d1 = false) {
  if (d1) {
    execFileSync("npx", ["drizzle-kit", "push", "--force"], { stdio: "inherit", cwd });
  } else {
    runScript(cwd, packagePath("internals", "push.ts"));
  }
}

function isCloudflareD1(cwd: string): boolean {
  const wranglerPath = path.join(cwd, "wrangler.toml");
  if (!existsSync(wranglerPath)) return false;
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    return content.includes("[[d1_databases]]");
  } catch {
    return false;
  }
}

// Miniflare keeps its own metadata.sqlite next to the D1 database files.
const isLocalD1File = (file: string) => file.endsWith(".sqlite") && file !== "*.sqlite" && file !== "metadata.sqlite";

function hasLocalD1Database(cwd: string): boolean {
  const dir = path.join(cwd, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  try {
    return readdirSync(dir).some(isLocalD1File);
  } catch {
    return false;
  }
}

function getD1DatabaseName(cwd: string): string | null {
  const wranglerPath = path.join(cwd, "wrangler.toml");
  try {
    const content = readFileSync(wranglerPath, "utf-8");
    const match = content.match(/database_name\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function initLocalD1(cwd: string) {
  const dbName = getD1DatabaseName(cwd);
  if (!dbName) throw new Error("No database_name found in wrangler.toml");
  execFileSync("npx", ["wrangler", "d1", "execute", dbName, "--local", "--command=SELECT 1"], {
    stdio: "pipe",
    cwd,
  });
}

/** Generate schema, types, validators, and API from cms.config.ts. */
export function runGenerator(root: string, generatorPath = defaultGeneratorPath) {
  console.log("  [cms] Generating schema, types, validators, and API...");
  try {
    runScript(root, generatorPath);
  } catch (error) {
    console.error("  [cms] Generator failed:", (error as Error).message);
  }
}

/** Dev only: create/sync the local database and keep the schema in sync while editing. */
export function startDevSchemaSync(root: string, configPath: string, generatorPath = defaultGeneratorPath) {
  const useD1 = isCloudflareD1(root);

  if (useD1) {
    const isFirstRun = !hasLocalD1Database(root);
    if (isFirstRun) {
      console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
      try {
        initLocalD1(root);
      } catch (error) {
        console.error("  \x1b[31m[cms]\x1b[0m Failed to initialize D1:", (error as Error).message);
      }
    }

    try {
      pushSchema(root, true);
      if (isFirstRun) {
        console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
      }
    } catch (error) {
      console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (error as Error).message);
      console.error("  \x1b[31m[cms]\x1b[0m Try running: npx drizzle-kit push --force");
    }
  } else {
    const dbPath = path.join(root, "data", "cms.db");
    const isFirstRun = !existsSync(dbPath);
    if (isFirstRun) {
      console.log("  \x1b[36m[cms]\x1b[0m First run — setting up database...");
    }

    try {
      mkdirSync(path.join(root, "data"), { recursive: true });
      pushSchema(root);
      if (isFirstRun) {
        console.log("  \x1b[36m[cms]\x1b[0m Database ready. Open /admin to create your admin account.");
      }
    } catch (error) {
      console.error("  \x1b[31m[cms]\x1b[0m Database setup failed:", (error as Error).message);
      console.error("  \x1b[31m[cms]\x1b[0m Try running: pnpm cms:push");
    }
  }

  const configFilePath = path.join(root, configPath.replace(/\/?$/, ".ts"));
  const collectionsDir = path.join(path.dirname(configFilePath), "collections");
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // macOS fs.watch also fires for sibling writes in the same directory
  // tree — including the generator's own .generated/* output, which
  // would loop regeneration forever. Only act when the content of a
  // watched schema file actually changed.
  const readSchemaFiles = () => {
    const contents = new Map<string, string>();
    const record = (filePath: string) => {
      try {
        contents.set(filePath, readFileSync(filePath, "utf-8"));
      } catch {
        /* deleted or unreadable — absence is the recorded state */
      }
    };
    record(configFilePath);
    let collectionFiles: string[] = [];
    try {
      collectionFiles = readdirSync(collectionsDir);
    } catch {
      /* no collections directory */
    }
    for (const name of collectionFiles) {
      if (name.endsWith(".ts")) record(path.join(collectionsDir, name));
    }
    return contents;
  };
  const sameContents = (a: Map<string, string>, b: Map<string, string>) =>
    a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
  let lastSchemaContents = readSchemaFiles();

  const onSchemaFileEvent = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const contents = readSchemaFiles();
      if (sameContents(lastSchemaContents, contents)) return;
      lastSchemaContents = contents;
      console.log("  [cms] Schema changed, regenerating...");
      try {
        runScript(root, generatorPath);
        pushSchema(root, useD1);
        console.log("  [cms] Schema updated.");
      } catch (error) {
        console.error("  [cms] Regeneration failed:", (error as Error).message);
      }
    }, 500);
  };

  watch(configFilePath, onSchemaFileEvent);
  try {
    watch(collectionsDir, onSchemaFileEvent);
  } catch {
    /* no collections directory — the config watch still covers registrations */
  }
}

/**
 * Source for a Worker default export that forwards `fetch` to `workerName` and adds the
 * `scheduled()` handler Cloudflare cron triggers call: it hits Kide's cron routes
 * through that same fetch, authorized by CRON_SECRET.
 */
export const scheduledWorkerSource = (workerName: string) =>
  `export default {
  fetch: (...args) => ${workerName}.fetch(...args),
  async scheduled(event, env, ctx) {
    const headers = env.CRON_SECRET ? { Authorization: "Bearer " + env.CRON_SECRET } : {};
    for (const path of ["/api/cms/cron/publish", "/api/cms/cron/tasks"]) {
      const res = await ${workerName}.fetch(new Request("https://dummy" + path, { headers }), env, ctx);
      if (!res.ok) console.error("Cron " + path + " failed:", res.status, await res.text());
      else console.log("Cron " + path + ":", await res.text());
    }
  }
};`;

/** Wraps a SvelteKit adapter-cloudflare worker (wrangler `main`) with the cron handler. */
export function addScheduledHandler(root: string) {
  let main = ".svelte-kit/cloudflare/_worker.js";
  for (const file of ["wrangler.toml", "wrangler.json", "wrangler.jsonc"]) {
    const configPath = path.join(root, file);
    if (!existsSync(configPath)) continue;
    const match = readFileSync(configPath, "utf-8").match(/^\s*"?main"?\s*[=:]\s*"([^"]+)"/m);
    if (match) main = match[1];
    break;
  }
  const workerPath = path.resolve(root, main);
  if (!existsSync(workerPath)) return;
  const source = readFileSync(workerPath, "utf-8");
  if (source.includes("async scheduled(")) return;
  if (!/^export default \{/m.test(source)) {
    console.warn(`  [cms] ${main} has an unexpected shape; cron triggers will not run scheduled publishing.`);
    return;
  }
  writeFileSync(
    workerPath,
    `${source.replace(/^export default \{/m, "const svelteKitWorker = {")}\n${scheduledWorkerSource("svelteKitWorker")}\n`,
  );
}
