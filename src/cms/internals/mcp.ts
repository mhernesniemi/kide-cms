import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { cms } from "@/cms/.generated/api";
import config from "@/cms/cms.config";
import { assets, closeDb, describeModel, folders } from "@/cms/core";
import type { CollectionConfig } from "@/cms/core";

const server = new McpServer({
  name: "kide-cms",
  version: "0.1.0",
});

const cmsRuntime = cms as Record<string, any> & { meta: typeof cms.meta };
const model = describeModel(config);

const statusSchema = z.enum(["draft", "published", "scheduled", "any"]);
const sortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});
const jsonObjectSchema = z.record(z.string(), z.unknown());

const actor = {
  id: process.env.KIDE_MCP_USER_ID || "mcp-local",
  role: process.env.KIDE_MCP_USER_ROLE || "admin",
  email: process.env.KIDE_MCP_USER_EMAIL || "mcp@local",
};

const runtimeContext = () => ({ user: actor });

const toResult = (value: unknown) => ({
  structuredContent: { result: value },
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

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

server.registerResource(
  "kide-model",
  "kide://model",
  {
    title: "Kide content model",
    description: "Machine-readable Kide CMS collection, field, locale, and content AST metadata.",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(model, null, 2) }],
  }),
);

server.registerTool(
  "kide_list_collections",
  {
    title: "List collections",
    description: "List all Kide collections and their high-level metadata.",
    inputSchema: {},
  },
  async () => toResult(cms.meta.getCollections()),
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
  async ({ collection }) => toResult(collectionModel(collection)),
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
  async ({ collection, where, search, sort, limit, offset, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const options = { where, search, sort, limit, offset, status, locale };
    const [docs, totalDocs] = await Promise.all([
      collectionApi.find(options, runtimeContext()),
      collectionApi.count({ where, search, status, locale }, runtimeContext()),
    ]);

    return toResult({ docs, totalDocs, limit, offset });
  },
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
  async ({ collection, where, search, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const totalDocs = await collectionApi.count({ where, search, status, locale }, runtimeContext());
    return toResult({ totalDocs });
  },
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
  async ({ collection, id, status, locale }) => {
    const collectionApi = getCollectionApi(collection);
    const doc = await collectionApi.findById(id, { status, locale }, runtimeContext());
    if (!doc) throw new Error(`No document found for "${collection}/${id}".`);
    return toResult(doc);
  },
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
  async ({ collection, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const collectionApi = getCollectionApi(collection);
    const cleaned = pickCollectionFields(collectionConfig, data);
    const doc = await collectionApi.create(cleaned, runtimeContext());
    return toResult(doc);
  },
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
  async ({ collection, id, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const collectionApi = getCollectionApi(collection);
    const cleaned = pickCollectionFields(collectionConfig, data);
    if (Object.keys(cleaned).length === 0) throw new Error("No declared collection fields were provided.");
    const doc = await collectionApi.update(id, cleaned, runtimeContext());
    return toResult(doc);
  },
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
  async ({ collection, id }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const doc = await getCollectionApi(collection).publish(id, runtimeContext());
    return toResult(doc);
  },
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
  async ({ collection, id }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const doc = await getCollectionApi(collection).unpublish(id, runtimeContext());
    return toResult(doc);
  },
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
  async ({ collection, id, publishAt, unpublishAt }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const doc = await getCollectionApi(collection).schedule(id, publishAt, unpublishAt ?? null, runtimeContext());
    return toResult(doc);
  },
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
  async ({ collection, id }) => {
    const translations = await getCollectionApi(collection).getTranslations(id);
    return toResult(translations);
  },
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
  async ({ collection, id, locale, data }) => {
    const collectionConfig = getCollection(collection);
    ensureMutableCollection(collectionConfig);
    const cleaned = pickTranslatableFields(collectionConfig, data);
    if (Object.keys(cleaned).length === 0) throw new Error("No translatable fields were provided.");
    const doc = await getCollectionApi(collection).upsertTranslation(id, locale, cleaned, runtimeContext());
    return toResult(doc);
  },
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
  async ({ limit, offset, folder, search }) => {
    const items = await assets.find({ limit, offset, folder, search });
    const totalAssets = await assets.count({ folder, search });
    return toResult({ items, totalAssets, limit, offset });
  },
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
  async ({ id, alt, filename, folder, focalX, focalY }) => {
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
    return toResult(updated);
  },
);

server.registerTool(
  "kide_list_asset_folders",
  {
    title: "List asset folders",
    description: "List Kide asset folders.",
    inputSchema: {},
  },
  async () => toResult(await folders.findAll()),
);

const shutdown = async () => {
  await closeDb();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await server.connect(new StdioServerTransport());
console.error("[kide:mcp] local MCP server started");
