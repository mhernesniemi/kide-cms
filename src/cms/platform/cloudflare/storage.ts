import { getCfEnv } from "./cf-env";

async function getBucket(): Promise<R2Bucket> {
  const env = await getCfEnv();
  const bucket = env.CMS_ASSETS;
  if (!bucket) throw new Error("R2 bucket binding CMS_ASSETS not found. Check wrangler.toml.");
  return bucket;
}

function toKey(storagePath: string): string {
  return storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
}

export async function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  await (await getBucket()).put(toKey(storagePath), data);
}

export async function getFile(storagePath: string): Promise<ArrayBuffer | null> {
  const obj = await (await getBucket()).get(toKey(storagePath));
  if (!obj) return null;
  return obj.arrayBuffer();
}

// Streams the R2 object body without buffering it in the Worker — used to serve public assets.
export async function getFileStream(storagePath: string): Promise<{ body: ReadableStream; size: number } | null> {
  const obj = await (await getBucket()).get(toKey(storagePath));
  if (!obj) return null;
  return { body: obj.body, size: obj.size };
}

export async function deleteFile(storagePath: string): Promise<void> {
  await (await getBucket()).delete(toKey(storagePath));
}
