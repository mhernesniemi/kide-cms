import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CMSConfig, CollectionConfig } from "./define";

export type StoredVersion = {
  version: number;
  createdAt: string;
  snapshot: Record<string, unknown>;
};

export type CollectionStore = {
  docs: Array<Record<string, unknown>>;
  versions: Record<string, StoredVersion[]>;
};

const getStorageRoot = (config: CMSConfig) => path.join(process.cwd(), config.storage?.root ?? ".cms-data");

const getCollectionPath = (config: CMSConfig, collection: CollectionConfig) =>
  path.join(getStorageRoot(config), `${collection.slug}.json`);

const defaultStore = (): CollectionStore => ({ docs: [], versions: {} });

export const readCollectionStore = async (
  config: CMSConfig,
  collection: CollectionConfig,
  initialStore?: CollectionStore,
) => {
  const storageRoot = getStorageRoot(config);
  const filePath = getCollectionPath(config, collection);

  await mkdir(storageRoot, { recursive: true });

  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as CollectionStore;
  } catch (error) {
    const store = initialStore ?? defaultStore();
    await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
    return store;
  }
};

export const writeCollectionStore = async (config: CMSConfig, collection: CollectionConfig, store: CollectionStore) => {
  const storageRoot = getStorageRoot(config);
  const filePath = getCollectionPath(config, collection);

  await mkdir(storageRoot, { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
};
