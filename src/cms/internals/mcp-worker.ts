/**
 * Child-process half of the MCP server (see mcp.ts). Loads the project modules
 * (cms.config, generated API, adapters) and executes named ops against them.
 * mcp.ts respawns this process when the schema changes on disk — a fresh
 * process gets a fresh ESM module registry, which is what makes hot-reload
 * possible.
 */
import { assets, closeDb, describeModel, folders } from "../core";
import type { CollectionConfig } from "../core";
import { loadGeneratedApi, loadProjectConfig } from "./project";

if (!process.send) throw new Error("mcp-worker.ts must be forked with an IPC channel by mcp.ts");
const sendToParent = process.send.bind(process);

const { cms } = await loadGeneratedApi();
const config = await loadProjectConfig();

const cmsRuntime = cms as Record<string, any> & { meta: typeof cms.meta };
const model = describeModel(config);

const actor = {
  id: process.env.KIDE_MCP_USER_ID || "mcp-local",
  role: process.env.KIDE_MCP_USER_ROLE || "admin",
  email: process.env.KIDE_MCP_USER_EMAIL || "mcp@local",
};

const runtimeContext = () => ({ user: actor });

const getCollection = (slug: string): CollectionConfig => {
  const collection = config.collections.find((entry) => entry.slug === slug);
  if (!collection) {
    const available = config.collections.map((entry) => entry.slug).join(", ");
    throw new Error(`Unknown collection "${slug}". Available collections: ${available}`);
  }
  return collection;
};

const getCollectionApi = (slug: string) => {
  getCollection(slug);
  const collectionApi = cmsRuntime[slug];
  if (!collectionApi) throw new Error(`No API found for collection "${slug}".`);
  return collectionApi;
};

const ensureMutableCollection = (collection: CollectionConfig) => {
  if (collection.auth && process.env.KIDE_MCP_ALLOW_AUTH_COLLECTIONS !== "true") {
    throw new Error(
      `Collection "${collection.slug}" is an auth collection. Set KIDE_MCP_ALLOW_AUTH_COLLECTIONS=true to allow MCP mutations.`,
    );
  }
};

const pickCollectionFields = (collection: CollectionConfig, input: Record<string, unknown>) => {
  const allowed = new Set(Object.keys(collection.fields));
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key)));
};

const pickTranslatableFields = (collection: CollectionConfig, input: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => cms.meta.isTranslatableField(collection.slug, key)),
  );
};

const collectionModel = (slug: string) => {
  getCollection(slug);
  const described = model.collections.find((collection) => collection.slug === slug);
  if (!described) throw new Error(`No model manifest found for collection "${slug}".`);
  return described;
};

type OpArgs = Record<string, any>;

const ops: Record<string, (args: OpArgs) => unknown> = {
  model: () => model,

  listCollections: () => cms.meta.getCollections(),

  describeCollection: ({ collection }) => collectionModel(collection),

  listDocuments: async ({ collection, where, search, sort, limit, offset, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const options = { where, search, sort, limit, offset, status, locale };
    const [docs, totalDocs] = await Promise.all([
      collectionApi.find(options, runtimeContext()),
      collectionApi.count({ where, search, status, locale }, runtimeContext()),
    ]);
    return { docs, totalDocs, limit, offset };
  },

  countDocuments: async ({ collection, where, search, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const totalDocs = await collectionApi.count({ where, search, status, locale }, runtimeContext());
    return { totalDocs };
  },

  getDocument: async ({ collection, id, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const doc = await collectionApi.findById(id, { status, locale }, runtimeContext());
    if (!doc) throw new Error(`No document found for "${collection}/${id}".`);
    return doc;
  },

  createDocument: async ({ collection, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const collectionApi = getCollectionApi(collection);
    const cleaned = pickCollectionFields(collectionConfig, data);
    return collectionApi.create(cleaned, runtimeContext());
  },

  updateDocument: async ({ collection, id, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const collectionApi = getCollectionApi(collection);
    const cleaned = pickCollectionFields(collectionConfig, data);
    if (Object.keys(cleaned).length === 0) throw new Error("No declared collection fields were provided.");
    return collectionApi.update(id, cleaned, runtimeContext());
  },

  publishDocument: async ({ collection, id }) => {
    ensureMutableCollection(getCollection(collection));
    return getCollectionApi(collection).publish(id, runtimeContext());
  },

  unpublishDocument: async ({ collection, id }) => {
    ensureMutableCollection(getCollection(collection));
    return getCollectionApi(collection).unpublish(id, runtimeContext());
  },

  scheduleDocument: async ({ collection, id, publishAt, unpublishAt }) => {
    ensureMutableCollection(getCollection(collection));
    return getCollectionApi(collection).schedule(id, publishAt, unpublishAt ?? null, runtimeContext());
  },

  getTranslations: ({ collection, id }) => getCollectionApi(collection).getTranslations(id),

  upsertTranslation: async ({ collection, id, locale, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const cleaned = pickTranslatableFields(collectionConfig, data);
    if (Object.keys(cleaned).length === 0) throw new Error("No translatable fields were provided.");
    return getCollectionApi(collection).upsertTranslation(id, locale, cleaned, runtimeContext());
  },

  listAssets: async ({ limit, offset, folder, search }) => {
    const items = await assets.find({ limit, offset, folder, search });
    const totalAssets = await assets.count({ folder, search });
    return { items, totalAssets, limit, offset };
  },

  updateAsset: async ({ id, alt, filename, folder, focalX, focalY }) => {
    const updated = await assets.update(
      id,
      {
        ...(alt !== undefined ? { alt } : {}),
        ...(filename !== undefined ? { filename } : {}),
        ...(folder !== undefined ? { folder } : {}),
        ...(focalX !== undefined ? { focalX } : {}),
        ...(focalY !== undefined ? { focalY } : {}),
      },
      { actor },
    );
    if (!updated) throw new Error(`No asset found for "${id}".`);
    return updated;
  },

  listAssetFolders: () => folders.findAll(),

  dispose: async () => {
    await closeDb();
    // Exit after the reply flushes; the parent's kill() is only a backup.
    setImmediate(() => process.exit(0));
    return null;
  },
};

process.on("message", (message: { id: number; op: string; args?: OpArgs }) => {
  void (async () => {
    try {
      const run = ops[message.op];
      if (!run) throw new Error(`Unknown MCP worker op "${message.op}".`);
      const result = await run(message.args ?? {});
      sendToParent({ id: message.id, ok: true, result: result ?? null });
    } catch (error) {
      sendToParent({
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});

sendToParent({ ready: true });
