import { AwsClient } from "aws4fetch";

import { readEnv } from "../../core/runtime";

// Any S3-compatible object store: AWS S3, UpCloud Object Storage, Hetzner, MinIO, R2's S3 API...
// Credentials come from env so they never land in the repo; read per call so .env reloads apply.
type S3Config = { client: AwsClient; baseUrl: string; prefix: string };

let cached: { key: string; config: S3Config } | null = null;

function getConfig(): S3Config {
  const env = (name: string) => readEnv(name)?.trim() || undefined;
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 storage needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }
  const region = env("S3_REGION") ?? "us-east-1";
  const endpoint = env("S3_ENDPOINT")?.replace(/\/+$/, "");
  const prefix = (env("S3_PREFIX") ?? "").replace(/^\/+|\/+$/g, "");

  const key = [bucket, accessKeyId, secretAccessKey, region, endpoint, prefix].join("\0");
  if (cached?.key === key) return cached.config;

  // Custom endpoints get path-style URLs (universally supported); AWS itself gets virtual-hosted.
  const baseUrl = endpoint ? `${endpoint}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`;
  const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  const config = { client, baseUrl, prefix };
  cached = { key, config };
  return config;
}

// "/uploads/a.jpg" → "<prefix>/uploads/a.jpg". Dot segments would be normalized away by URL
// parsing and could address keys outside the prefix, so they're rejected outright.
function objectUrl(storagePath: string): { client: AwsClient; url: string } {
  const segments = storagePath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }
  const { client, baseUrl, prefix } = getConfig();
  const key = [...(prefix ? prefix.split("/") : []), ...segments].map(encodeURIComponent).join("/");
  return { client, url: `${baseUrl}/${key}` };
}

async function request(storagePath: string, init: RequestInit): Promise<Response | null> {
  const { client, url } = objectUrl(storagePath);
  const res = await client.fetch(url, init);
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`S3 ${init.method} ${storagePath} failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return res;
}

export async function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  await request(storagePath, { method: "PUT", body: data as BodyInit });
}

export async function getFile(storagePath: string): Promise<ArrayBuffer | null> {
  const res = await request(storagePath, { method: "GET" });
  return res ? res.arrayBuffer() : null;
}

export async function getFileStream(storagePath: string): Promise<{ body: ReadableStream; size: number } | null> {
  const res = await request(storagePath, { method: "GET" });
  if (!res?.body) return null;
  return { body: res.body, size: Number(res.headers.get("content-length") ?? 0) };
}

export async function deleteFile(storagePath: string): Promise<void> {
  // S3 DELETE is idempotent (204 for missing keys); a 404 here means the bucket is wrong.
  const res = await request(storagePath, { method: "DELETE" });
  if (!res) throw new Error(`S3 bucket not found while deleting ${storagePath}`);
}
