import { env } from "cloudflare:workers";

function getBucket(): R2Bucket {
  const bucket = (env as any).CMS_ASSETS as R2Bucket | undefined;
  if (!bucket) throw new Error("R2 bucket binding CMS_ASSETS not found. Check wrangler.toml.");
  return bucket;
}

function toKey(storagePath: string): string {
  return storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
}

export async function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  await getBucket().put(toKey(storagePath), data);
}

export async function getFile(storagePath: string): Promise<ArrayBuffer | null> {
  const obj = await getBucket().get(toKey(storagePath));
  if (!obj) return null;
  return obj.arrayBuffer();
}

export async function deleteFile(storagePath: string): Promise<void> {
  await getBucket().delete(toKey(storagePath));
}
