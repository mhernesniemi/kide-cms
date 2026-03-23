import { existsSync, mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export async function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  const filePath = path.join(PUBLIC_DIR, storagePath);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  await writeFile(filePath, buf);
}

export async function getFile(storagePath: string): Promise<ArrayBuffer | null> {
  const filePath = path.join(PUBLIC_DIR, storagePath);
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export async function deleteFile(storagePath: string): Promise<void> {
  const filePath = path.join(PUBLIC_DIR, storagePath);
  try {
    await unlink(filePath);
  } catch {
    // File may already be deleted
  }
}
