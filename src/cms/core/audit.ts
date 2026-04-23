import { lt } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "./runtime";
import { getSchema } from "./schema";

export type AuditActor = { id: string; email: string; role: string } | null;

export type AuditEvent = {
  action: string;
  resourceType: "content" | "asset" | "user" | "invite" | "session";
  resourceCollection?: string | null;
  resourceId?: string | null;
  actor?: AuditActor;
  /** Used when the actor is unknown but we still want to record an attempted identifier (e.g. failed login). */
  attemptedEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const extractIp = (request: Request): string | null => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
};

export const auditRequestMeta = (request: Request) => ({
  ipAddress: extractIp(request),
  userAgent: request.headers.get("user-agent"),
});

export const recordAudit = async (event: AuditEvent): Promise<void> => {
  const row = {
    _id: nanoid(),
    timestamp: Date.now(),
    actorId: event.actor?.id ?? null,
    actorEmail: event.actor?.email ?? event.attemptedEmail ?? null,
    actorRole: event.actor?.role ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceCollection: event.resourceCollection ?? null,
    resourceId: event.resourceId ?? null,
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
  };

  // Structured log line. Filter by `kind: "audit"` in Cloudflare Workers Logs,
  // `wrangler tail`, or any stdout-to-log pipeline (Logpush, Datadog, Axiom…).
  console.log(JSON.stringify({ kind: "audit", ...row }));

  try {
    const db = await getDb();
    const schema = getSchema();
    await db.insert(schema.cmsAuditLog).values(row);
  } catch (error) {
    console.warn("[audit] failed to persist event", event.action, error);
  }
};

export const pruneAuditLog = async (olderThanMs: number): Promise<number> => {
  const db = await getDb();
  const schema = getSchema();
  const cutoff = Date.now() - olderThanMs;
  const result: any = await db.delete(schema.cmsAuditLog).where(lt(schema.cmsAuditLog.timestamp, cutoff));
  return Number(result?.changes ?? result?.rowsAffected ?? 0);
};
