import type { APIRoute } from "astro";

import { cms } from "virtual:kide/api";
import { readEnv } from "virtual:kide/runtime";
import { PayloadTooLargeError, readLimitedText } from "../../../core";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { tasks: typeof cms.tasks };

// Unauthenticated until the signature checks out, and the whole body has to be read
// before it can — so cap it on the stream, or a peer with no secret at all could push
// arbitrarily large payloads into memory (and, once signed, into the outbox row).
const MAX_BODY_BYTES = 1024 * 1024;

const hexToBytes = (hex: string) => {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length === 0 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

const verifySignature = async (body: string, signatureHeader: string, secret: string): Promise<boolean> => {
  const bytes = hexToBytes(signatureHeader.replace(/^sha256=/, "").trim());
  if (!bytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
};

// Verify-then-enqueue: a valid HMAC-signed POST becomes a durable
// `webhook.<provider>` task; the app handles it in config.integrations.tasks.
export const POST: APIRoute = async ({ request, params }) => {
  const provider = String(params.provider ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const secret = provider ? readEnv(`WEBHOOK_SECRET_${provider.toUpperCase().replace(/-/g, "_")}`) : undefined;
  if (!secret) {
    return Response.json({ error: "Unknown webhook provider" }, { status: 404 });
  }

  let body: string;
  try {
    body = await readLimitedText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    throw error;
  }
  const signature = request.headers.get("x-webhook-signature") ?? "";
  if (!(await verifySignature(body, signature, secret))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await cmsRuntime.tasks.enqueue(`webhook.${provider}`, payload);
  return Response.json({ received: true });
};
