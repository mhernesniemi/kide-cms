import type { CMSConfig, WebhookConfig, WebhookContext, WebhookEvent } from "./define";
import { trackTask } from "./request-scope";
import { enqueueTask } from "./tasks";

const TIMEOUT_MS = 5000;

export type WebhookDeliveryRef = {
  webhookName: string;
  event: WebhookEvent;
  collection: string;
  doc: Record<string, unknown>;
  user: WebhookContext["user"];
  timestamp: string;
};

const buildPayload = (webhook: WebhookConfig, ref: WebhookDeliveryRef) => {
  const context: WebhookContext = {
    user: ref.user,
    event: ref.event,
    collection: ref.collection,
    timestamp: ref.timestamp,
  };
  return webhook.payload
    ? webhook.payload(ref.doc, context)
    : { event: ref.event, collection: ref.collection, doc: ref.doc, user: ref.user, timestamp: ref.timestamp };
};

/** One delivery attempt as a durable outbox task. URL/headers resolve from live config, never stored. */
export async function deliverWebhookTask(ref: WebhookDeliveryRef, ctx: { config: CMSConfig }): Promise<void> {
  const webhook = ctx.config.admin?.webhooks?.find((w) => w.name === ref.webhookName);
  if (!webhook) {
    // Config no longer defines this webhook (renamed/removed) — nothing to retry.
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(webhook.url, {
      method: webhook.method ?? "POST",
      headers: { "Content-Type": "application/json", ...webhook.headers },
      body: JSON.stringify(buildPayload(webhook, ref)),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`webhook ${webhook.name} → HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Durably enqueue a delivery reference for every webhook matching this event. */
export function dispatchWebhooks(
  config: CMSConfig,
  event: WebhookEvent,
  collectionSlug: string,
  doc: Record<string, unknown>,
  user: WebhookContext["user"],
): void {
  const webhooks = config.admin?.webhooks;
  if (!webhooks || webhooks.length === 0) return;

  const matching = webhooks.filter(
    (webhook: WebhookConfig) =>
      webhook.events.includes(event) && (!webhook.collections || webhook.collections.includes(collectionSlug)),
  );
  if (matching.length === 0) return;

  const timestamp = new Date().toISOString();
  for (const webhook of matching) {
    const ref: WebhookDeliveryRef = {
      webhookName: webhook.name,
      event,
      collection: collectionSlug,
      doc,
      user: user ?? null,
      timestamp,
    };
    // If the enqueue itself fails, the event is lost — log loudly rather than swallow it.
    trackTask(
      enqueueTask("webhook.deliver", ref).catch((error) => {
        console.error(`[webhook] failed to enqueue "${webhook.name}" for ${event}/${collectionSlug}:`, error);
      }),
    );
  }
}
