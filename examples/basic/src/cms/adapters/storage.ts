import { existsSync, mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");

export async function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  const filePath = path.join(publicDir, storagePath);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  await writeFile(filePath, buffer);
}

export async function getFile(storagePath: string): Promise<ArrayBuffer | null> {
  const filePath = path.join(publicDir, storagePath);
  if (!existsSync(filePath)) return null;
  const buffer = await readFile(filePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export async function deleteFile(storagePath: string): Promise<void> {
  const filePath = path.join(publicDir, storagePath);
  try {
    await unlink(filePath);
  } catch {
    // File may already be deleted.
  }
}
