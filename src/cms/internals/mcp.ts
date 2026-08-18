/**
 * Local stdio MCP server. This process owns the transport and the (static)
 * tool list and never restarts; the project modules (cms.config, generated
 * API, DB) load inside a child process (mcp-worker.ts). When the schema
 * changes on disk, the next tool call respawns the worker — a fresh process
 * gets a fresh ESM module registry — so agents pick up new collections
 * without reconnecting the client. An in-process reload is not possible (the
 * ESM module cache cannot be invalidated), and worker threads don't inherit
 * tsx's resolver, so a forked process it is.
 */
import { fork } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { projectPath } from "./project";

const server = new McpServer({
  name: "kide-cms",
  version: "0.1.0",
});

const WATCHED_FILES = ["src/cms/cms.config.ts", "src/cms/.generated/api.ts"];
const COLLECTIONS_DIR = "src/cms/collections";

const takeSnapshot = () => {
  const entries = new Map<string, number | null>();
  const record = (...segments: string[]) => {
    try {
      entries.set(segments.join("/"), statSync(projectPath(...segments)).mtimeMs);
    } catch {
      entries.set(segments.join("/"), null);
    }
  };
  for (const file of WATCHED_FILES) record(file);
  let collectionFiles: string[] = [];
  try {
    collectionFiles = readdirSync(projectPath(COLLECTIONS_DIR));
  } catch {
    // no collections directory
  }
  for (const name of collectionFiles) record(COLLECTIONS_DIR, name);
  return entries;
};

const sameSnapshot = (a: Map<string, number | null>, b: Map<string, number | null>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

type WorkerResponse = { ready: true } | { id: number; ok: boolean; result?: unknown; error?: string };

type WorkerHandle = {
  call: (op: string, args?: Record<string, unknown>) => Promise<unknown>;
  dispose: () => Promise<void>;
  isDead: () => boolean;
};

const spawnWorker = (): Promise<WorkerHandle> =>
  new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL("./mcp-worker-boot.mjs", import.meta.url)), [], {
      // stdout belongs to the MCP transport — route the child's output to stderr.
      stdio: ["ignore", 2, 2, "ipc"],
    });
    // Don't let the worker keep this process alive once the client closes stdio.
    child.unref();
    child.channel?.unref();
    const calls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    let counter = 0;
    let ready = false;
    let dead: Error | null = null;

    const handle: WorkerHandle = {
      isDead: () => dead !== null,
      call: (op, args) => {
        if (dead) return Promise.reject(dead);
        return new Promise((resolveCall, rejectCall) => {
          const id = counter++;
          calls.set(id, { resolve: resolveCall, reject: rejectCall });
          child.send({ id, op, args });
        });
      },
      dispose: async () => {
        if (!dead) {
          // Let the worker close the DB, but never hang a swap on it.
          await Promise.race([handle.call("dispose"), new Promise((r) => setTimeout(r, 2000))]).catch(() => {});
          dead = new Error("kide MCP worker was replaced.");
        }
        child.kill();
      },
    };

    const die = (error: Error) => {
      if (dead) return;
      dead = error;
      for (const entry of calls.values()) entry.reject(error);
      calls.clear();
      if (!ready) reject(error);
    };

    child.on("message", (message: WorkerResponse) => {
      if ("ready" in message) {
        ready = true;
        resolve(handle);
        return;
      }
      const entry = calls.get(message.id);
      if (!entry) return;
      calls.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error ?? "kide MCP worker call failed."));
    });
    child.on("error", (error) => die(error instanceof Error ? error : new Error(String(error))));
    child.on("exit", (code) => die(new Error(`kide MCP worker exited unexpectedly (code ${code}).`)));
  });

let active: WorkerHandle | null = null;
let snapshot = takeSnapshot();
let swapping: Promise<void> | null = null;

const refreshWorker = (): Promise<void> => {
  swapping ??= (async () => {
    const previous = active;
    active = null;
    if (previous) {
      console.error("[kide:mcp] schema change detected — reloading project modules");
      await previous.dispose();
    }
    // Snapshot before spawning: a file that changes while the worker loads
    // stays stale in the snapshot and triggers another reload on the next call.
    snapshot = takeSnapshot();
    active = await spawnWorker();
  })().finally(() => {
    swapping = null;
  });
  return swapping;
};

const workerCall = async (op: string, args?: Record<string, unknown>) => {
  if (swapping) await swapping;
  if (!active || active.isDead() || !sameSnapshot(snapshot, takeSnapshot())) await refreshWorker();
  if (!active) throw new Error("kide MCP worker failed to start.");
  return active.call(op, args);
};

const statusSchema = z.enum(["draft", "published", "scheduled", "any"]);
const sortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});
const jsonObjectSchema = z.record(z.string(), z.unknown());

const toResult = (value: unknown) => ({
  structuredContent: { result: value },
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerResource(
  "kide-model",
  "kide://model",
  {
    title: "Kide content model",
    description: "Machine-readable Kide CMS collection, field, locale, and content AST metadata.",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      { uri: uri.href, mimeType: "application/json", text: JSON.stringify(await workerCall("model"), null, 2) },
    ],
  }),
);

server.registerTool(
  "kide_list_collections",
  {
    title: "List collections",
    description: "List all Kide collections and their high-level metadata.",
    inputSchema: {},
  },
  async () => toResult(await workerCall("listCollections")),
);

server.registerTool(
  "kide_describe_collection",
  {
    title: "Describe collection",
    description:
      "Return the schema, field value shapes, translatable fields, and publishing settings for a collection.",
    inputSchema: {
      collection: z.string().min(1),
    },
  },
  async (args) => toResult(await workerCall("describeCollection", args)),
);

server.registerTool(
  "kide_list_documents",
  {
    title: "List documents",
    description:
      "List documents in a collection with optional filters, search, sort, locale, status, limit, and offset.",
    inputSchema: {
      collection: z.string().min(1),
      where: jsonObjectSchema.optional(),
      search: z.string().optional(),
      sort: sortSchema.optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: statusSchema.optional(),
      locale: z.string().min(1).optional(),
    },
  },
  async (args) => toResult(await workerCall("listDocuments", args)),
);

server.registerTool(
  "kide_count_documents",
  {
    title: "Count documents",
    description: "Count documents in a collection with optional filters, search, locale, and status.",
    inputSchema: {
      collection: z.string().min(1),
      where: jsonObjectSchema.optional(),
      search: z.string().optional(),
      status: statusSchema.optional(),
      locale: z.string().min(1).optional(),
    },
  },
  async (args) => toResult(await workerCall("countDocuments", args)),
);

server.registerTool(
  "kide_get_document",
  {
    title: "Get document",
    description: "Get one document by id, optionally overlaying a locale and selecting status.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
      status: statusSchema.optional(),
      locale: z.string().min(1).optional(),
    },
  },
  async (args) => toResult(await workerCall("getDocument", args)),
);

server.registerTool(
  "kide_create_document",
  {
    title: "Create document",
    description:
      "Create a document. Only declared collection fields are accepted; system fields are ignored. Draft-enabled collections create drafts by default.",
    inputSchema: {
      collection: z.string().min(1),
      data: jsonObjectSchema,
    },
  },
  async (args) => toResult(await workerCall("createDocument", args)),
);

server.registerTool(
  "kide_update_document",
  {
    title: "Update document",
    description:
      "Update a document by id. Only declared collection fields are accepted; publishing remains a separate explicit tool.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
      data: jsonObjectSchema,
    },
  },
  async (args) => toResult(await workerCall("updateDocument", args)),
);

server.registerTool(
  "kide_publish_document",
  {
    title: "Publish document",
    description: "Publish a draft-enabled document by id.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
    },
  },
  async (args) => toResult(await workerCall("publishDocument", args)),
);

server.registerTool(
  "kide_unpublish_document",
  {
    title: "Unpublish document",
    description: "Unpublish a draft-enabled document by id.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
    },
  },
  async (args) => toResult(await workerCall("unpublishDocument", args)),
);

server.registerTool(
  "kide_schedule_document",
  {
    title: "Schedule document",
    description: "Schedule a draft-enabled document to publish and optionally unpublish at ISO timestamps.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
      publishAt: z.string().min(1),
      unpublishAt: z.string().min(1).nullable().optional(),
    },
  },
  async (args) => toResult(await workerCall("scheduleDocument", args)),
);

server.registerTool(
  "kide_get_translations",
  {
    title: "Get translations",
    description: "Return all stored translations for a document.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
    },
  },
  async (args) => toResult(await workerCall("getTranslations", args)),
);

server.registerTool(
  "kide_upsert_translation",
  {
    title: "Upsert translation",
    description: "Create or update a locale translation. Only translatable fields are accepted.",
    inputSchema: {
      collection: z.string().min(1),
      id: z.string().min(1),
      locale: z.string().min(1),
      data: jsonObjectSchema,
    },
  },
  async (args) => toResult(await workerCall("upsertTranslation", args)),
);

server.registerTool(
  "kide_list_assets",
  {
    title: "List assets",
    description: "List Kide asset records, optionally scoped to a folder.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      folder: z.string().nullable().optional(),
      search: z.string().optional(),
    },
  },
  async (args) => toResult(await workerCall("listAssets", args)),
);

server.registerTool(
  "kide_update_asset",
  {
    title: "Update asset",
    description: "Update safe asset metadata such as alt text, filename, folder, or focal point.",
    inputSchema: {
      id: z.string().min(1),
      alt: z.string().optional(),
      filename: z.string().min(1).optional(),
      folder: z.string().nullable().optional(),
      focalX: z.number().nullable().optional(),
      focalY: z.number().nullable().optional(),
    },
  },
  async (args) => toResult(await workerCall("updateAsset", args)),
);

server.registerTool(
  "kide_list_asset_folders",
  {
    title: "List asset folders",
    description: "List Kide asset folders.",
    inputSchema: {},
  },
  async () => toResult(await workerCall("listAssetFolders")),
);

const shutdown = async () => {
  const current = active;
  active = null;
  if (current) await current.dispose();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

// Load the project eagerly so the first tool call is fast; a failure (e.g. a
// type error in cms.config.ts) is reported per tool call and retried there,
// instead of preventing the server from starting.
void refreshWorker().catch((error: unknown) => {
  console.error(`[kide:mcp] project load failed: ${error instanceof Error ? error.message : String(error)}`);
});

await server.connect(new StdioServerTransport());
console.error("[kide:mcp] local MCP server started");
