import type { APIRoute } from "astro";
import { assets } from "virtual:kide/runtime";
import config from "virtual:kide/config";
import { PayloadTooLargeError, readLimitedFormData } from "../../../core";

export const prerender = false;

// SVG is deliberately absent — it executes script when served inline from the admin's
// origin. Re-enable via `admin.uploads.allowedTypes` only behind a CSP or Content-Disposition.
const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "video/mp4",
  "video/webm",
];

const ALLOWED_TYPES = new Set(config.admin?.uploads?.allowedTypes ?? DEFAULT_ALLOWED_TYPES);
const MAX_FILE_SIZE = config.admin?.uploads?.maxFileSize ?? 50 * 1024 * 1024; // 50 MB
const MAX_FILES_PER_UPLOAD = 20;

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

export const POST: APIRoute = async ({ request, locals }) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  // Enforce the size cap on the raw byte stream — Content-Length is optional (absent on
  // chunked requests) and checking `file.size` only after formData() already buffered
  // everything is too late. A small overhead covers non-file fields + multipart framing.
  let formData: FormData;
  try {
    formData = await readLimitedFormData(request, MAX_FILES_PER_UPLOAD * MAX_FILE_SIZE + 64 * 1024);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Upload exceeds the size limit." }, { status: 413 });
    }
    throw error;
  }
  const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
  const alt = formData.get("alt");
  const folder = formData.get("folder");

  if (files.length === 0) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }

  if (files.length > MAX_FILES_PER_UPLOAD) {
    return Response.json({ error: `Too many files (max ${MAX_FILES_PER_UPLOAD} per upload).` }, { status: 400 });
  }

  // Validate every file before storing any, so a bad file mid-batch never
  // leaves a partial upload behind.
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ error: `File type "${file.type}" is not allowed.` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `"${file.name}" exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB size limit.` },
        { status: 400 },
      );
    }

    // Verify via the header only (slice leaves `file` unconsumed → assets.upload reads it once).
    const header = await file.slice(0, 256).arrayBuffer();
    if (!verifyMagicBytes(header, file.type)) {
      return Response.json({ error: `"${file.name}" content does not match declared type.` }, { status: 400 });
    }
  }

  const user = locals.user;
  const actor = user ? { id: user.id, email: user.email, role: user.role } : null;
  const uploaded = [];
  for (const file of files) {
    uploaded.push(
      await assets.upload(
        file,
        {
          // alt describes one file — never apply the same text to a whole batch
          alt: alt && files.length === 1 ? String(alt) : undefined,
          folder: folder ? String(folder) : undefined,
        },
        { actor },
      ),
    );
  }

  // Dev only: let Vite's dev server catch up on the new files before the client
  // reloads, or the just-uploaded asset renders broken until a manual refresh.
  if (import.meta.env.DEV) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  const redirectTo = formData.get("redirectTo");

  if (redirectTo) {
    const location =
      uploaded.length === 1
        ? `/admin/assets/${uploaded[0]._id}?_toast=success&_msg=Asset+uploaded`
        : `/admin/assets?_toast=success&_msg=${uploaded.length}+assets+uploaded`;
    return new Response(null, { status: 303, headers: { Location: location } });
  }

  return Response.json(uploaded.length === 1 ? uploaded[0] : uploaded, { status: 201 });
};
