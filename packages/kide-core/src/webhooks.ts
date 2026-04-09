import type { CMSConfig, WebhookConfig, WebhookContext, WebhookEvent } from "./define";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;
const RETRY_DELAYS = [1000, 3000, 9000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function deliverOnce(webhook: WebhookConfig, body: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(webhook.url, {
      method: webhook.method ?? "POST",
      headers: { "Content-Type": "application/json", ...webhook.headers },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliverWebhook(webhook: WebhookConfig, body: string): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await deliverOnce(webhook, body);
    if (result.ok) {
      if (attempt > 0) {
        console.log(`  [webhook] ${webhook.name} delivered after ${attempt + 1} attempts`);
      }
      return;
    }
    const detail = result.status ? `HTTP ${result.status}` : result.error;
    if (attempt < MAX_RETRIES) {
      console.warn(`  [webhook] ${webhook.name} failed (${detail}) — retrying in ${RETRY_DELAYS[attempt]}ms`);
      await sleep(RETRY_DELAYS[attempt]);
    } else {
      console.error(`  [webhook] ${webhook.name} failed permanently after ${MAX_RETRIES + 1} attempts: ${detail}`);
    }
  }
}

export async function dispatchWebhooks(
  config: CMSConfig,
  event: WebhookEvent,
  collectionSlug: string,
  doc: Record<string, unknown>,
  user: WebhookContext["user"],
): Promise<void> {
  const webhooks = config.admin?.webhooks;
  if (!webhooks || webhooks.length === 0) return;

  const matching = webhooks.filter((webhook) => {
    if (!webhook.events.includes(event)) return false;
    if (webhook.collections && !webhook.collections.includes(collectionSlug)) return false;
    return true;
  });

  if (matching.length === 0) return;

  const context: WebhookContext = {
    user: user ?? null,
    event,
    collection: collectionSlug,
    timestamp: new Date().toISOString(),
  };

  // Fire all matching webhooks in parallel — don't block the operation
  for (const webhook of matching) {
    const payload = webhook.payload ? webhook.payload(doc, context) : { event, collection: collectionSlug, doc, user, timestamp: context.timestamp };
    const body = JSON.stringify(payload);
    // Fire and forget — failures are logged but don't bubble up
    deliverWebhook(webhook, body).catch((err) => {
      console.error(`  [webhook] ${webhook.name} dispatcher error:`, err);
    });
  }
}
