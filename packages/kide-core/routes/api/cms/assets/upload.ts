import type { APIRoute } from "astro";
import { assets } from "virtual:kide/runtime";
import config from "virtual:kide/config";

export const prerender = false;

const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
  "video/mp4",
  "video/webm",
];

const ALLOWED_TYPES = new Set(config.admin?.uploads?.allowedTypes ?? DEFAULT_ALLOWED_TYPES);
const MAX_FILE_SIZE = config.admin?.uploads?.maxFileSize ?? 50 * 1024 * 1024; // 50 MB

// Magic number signatures for binary file type verification
const MAGIC_SIGNATURES: Array<{ type: string; bytes: number[]; offset?: number }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { type: "video/mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ....ftyp
];

function verifyMagicBytes(buffer: ArrayBuffer, declaredType: string): boolean {
  // SVG and text-based formats can't be verified by magic bytes
  if (declaredType === "image/svg+xml") {
    const text = new TextDecoder().decode(buffer.slice(0, 256));
    return text.includes("<svg") || text.trimStart().startsWith("<?xml");
  }

  const header = new Uint8Array(buffer.slice(0, 16));
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.type !== declaredType) continue;
    const offset = sig.offset ?? 0;
    const match = sig.bytes.every((byte, i) => header[offset + i] === byte);
    if (match) return true;
  }

  // AVIF is an ISOBMFF container — check for ftyp box with avif brand
  if (declaredType === "image/avif") {
    const offset4 = new Uint8Array(buffer.slice(4, 12));
    const ftypStr = String.fromCharCode(...offset4);
    return ftypStr.startsWith("ftyp") && ftypStr.includes("avif");
  }

  // video/webm starts with EBML header
  if (declaredType === "video/webm") {
    return header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  }

  return false;
}

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const alt = formData.get("alt");
  const folder = formData.get("folder");

  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: `File type "${file.type}" is not allowed.` }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB size limit.` }, { status: 400 });
  }

  // Verify file content matches declared type
  const buffer = await file.arrayBuffer();
  if (!verifyMagicBytes(buffer, file.type)) {
    return Response.json({ error: "File content does not match declared type." }, { status: 400 });
  }

  // Reconstruct File from buffer since arrayBuffer() consumed the stream
  const verifiedFile = new File([buffer], file.name, { type: file.type });

  const asset = await assets.upload(verifiedFile, {
    alt: alt ? String(alt) : undefined,
    folder: folder ? String(folder) : undefined,
  });

  const redirectTo = formData.get("redirectTo");

  if (redirectTo) {
    // Delay so Vite's dev server picks up the new file before the redirect
    await new Promise((r) => setTimeout(r, 1000));
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/assets/${asset._id}?_toast=success&_msg=Asset+uploaded` },
    });
  }

  return Response.json(asset, { status: 201 });
};
