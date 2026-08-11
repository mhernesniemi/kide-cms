import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { CMSConfig } from "./define";
import { getDb } from "./runtime";
import { getSchema } from "./schema";

// Durable background tasks ("the database is the queue"): enqueue is a plain
// insert into cms_outbox, drainTasks claims due rows with an optimistic lease
// and runs the handler registered in config.integrations.tasks. Handlers throw
// to retry with exponential backoff and return to complete — delivery is
// at-least-once, so handlers must tolerate re-runs.

const BASE_BACKOFF_MS = 30_000;
const CLAIM_LEASE_MS = 5 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type EnqueueTaskOptions = {
  /** Delay before the first attempt (default: due on the next drain). */
  delayMs?: number;
  /** Attempts before the task is marked failed (default 5). */
  maxAttempts?: number;
  /** Skip enqueueing when a pending task with the same key already exists. */
  dedupeKey?: string;
};

export type DrainResult = { processed: number; succeeded: number; failed: number };

// Core-provided task handlers. Dynamic imports avoid a static import cycle.
const BUILTIN_TASK_HANDLERS: Record<string, (payload: any, ctx: { config: CMSConfig }) => Promise<void>> = {
  "webhook.deliver": async (payload, ctx) => {
    const { deliverWebhookTask } = await import("./webhooks");
    await deliverWebhookTask(payload, ctx);
  },
};

const outboxTable = () => getSchema().cmsOutbox;

/** Durably enqueue a background task. Returns the task id, or null when deduped. */
export const enqueueTask = async (
  type: string,
  payload?: unknown,
  options: EnqueueTaskOptions = {},
): Promise<string | null> => {
  const db = await getDb();
  const outbox = outboxTable();

  if (options.dedupeKey) {
    const existing = await db
      .select({ _id: outbox._id })
      .from(outbox)
      .where(and(eq(outbox.dedupeKey, options.dedupeKey), eq(outbox.status, "pending")))
      .limit(1);
    if (existing.length > 0) return null;
  }

  const id = nanoid();
  const timestamp = Date.now();
  await db.insert(outbox).values({
    _id: id,
    type,
    payload: payload === undefined ? null : JSON.stringify(payload),
    status: "pending",
    attempts: 0,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: timestamp + (options.delayMs ?? 0),
    dedupeKey: options.dedupeKey ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return id;
};

/** Run due tasks: claim with a lease, execute the registered handler, retry with backoff. */
export const drainTasks = async (config: CMSConfig, limit = 25): Promise<DrainResult> => {
  const db = await getDb();
  const outbox = outboxTable();
  const handlers = config.integrations?.tasks ?? {};

  const due = await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "pending"), lte(outbox.nextAttemptAt, Date.now())))
    .orderBy(outbox.nextAttemptAt)
    .limit(limit);

  const result: DrainResult = { processed: 0, succeeded: 0, failed: 0 };

  for (const task of due) {
    // Optimistic claim: bump attempts and lease the row so a concurrent drain skips it.
    const claimed = await db
      .update(outbox)
      .set({
        attempts: task.attempts + 1,
        nextAttemptAt: Date.now() + CLAIM_LEASE_MS,
        updatedAt: Date.now(),
      })
      .where(and(eq(outbox._id, task._id), eq(outbox.status, "pending"), eq(outbox.attempts, task.attempts)))
      .returning({ _id: outbox._id });
    if (claimed.length === 0) continue;

    result.processed++;
    const attempt = task.attempts + 1;
    const handler = handlers[String(task.type)] ?? BUILTIN_TASK_HANDLERS[String(task.type)];

    try {
      if (!handler) throw new Error(`No task handler registered for "${task.type}"`);
      const payload = task.payload == null ? undefined : JSON.parse(String(task.payload));
      await handler(payload, { config });
      await db
        .update(outbox)
        .set({ status: "done", lastError: null, updatedAt: Date.now() })
        .where(eq(outbox._id, task._id));
      result.succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = attempt >= task.maxAttempts;
      await db
        .update(outbox)
        .set({
          status: exhausted ? "failed" : "pending",
          lastError: message,
          nextAttemptAt: Date.now() + BASE_BACKOFF_MS * 2 ** (attempt - 1),
          updatedAt: Date.now(),
        })
        .where(eq(outbox._id, task._id));
      if (exhausted) result.failed++;
      console.error(`[tasks] ${task.type} attempt ${attempt}/${task.maxAttempts} failed: ${message}`);
    }
  }

  return result;
};

const scheduleDedupeKey = (schedule: { task: string; payload?: unknown }) =>
  schedule.payload === undefined
    ? `schedule:${schedule.task}`
    : `schedule:${schedule.task}:${JSON.stringify(schedule.payload)}`;

/** Enqueue configured recurring tasks whose interval has elapsed since their last run. */
export const tickSchedules = async (config: CMSConfig): Promise<number> => {
  const schedules = config.integrations?.schedules ?? [];
  if (schedules.length === 0) return 0;

  const db = await getDb();
  const outbox = outboxTable();
  let scheduled = 0;

  for (const schedule of schedules) {
    const dedupeKey = scheduleDedupeKey(schedule);
    const latest = await db
      .select({ createdAt: outbox.createdAt })
      .from(outbox)
      .where(eq(outbox.dedupeKey, dedupeKey))
      .orderBy(desc(outbox.createdAt))
      .limit(1);

    const dueSince = Date.now() - schedule.everyMinutes * 60_000;
    if (latest.length > 0 && Number(latest[0].createdAt) > dueSince) continue;

    const id = await enqueueTask(schedule.task, schedule.payload, { dedupeKey });
    if (id) scheduled++;
  }

  return scheduled;
};

/** Delete completed AND failed tasks older than the cutoff (default 7 days). */
export const pruneTasks = async (olderThanMs = DEFAULT_PRUNE_AFTER_MS): Promise<void> => {
  const db = await getDb();
  const outbox = outboxTable();
  await db
    .delete(outbox)
    .where(and(inArray(outbox.status, ["done", "failed"]), lte(outbox.updatedAt, Date.now() - olderThanMs)));
};
