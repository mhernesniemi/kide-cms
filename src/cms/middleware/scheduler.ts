import type { APIContext } from "astro";

import { readEnv } from "../core";
import { log } from "../core/log";
import { runPublishJob, runTasksJob } from "../routes/api/cron/_jobs";

const INTERVAL_MS = 60_000;

let started = false;

// CMS_SCHEDULER=1 runs the publish and tasks cron jobs inside a long-lived Node server, replacing an
// external cron. Starts on the first request: Astro's standalone server has no boot hook, and the
// request's cache handle is needed so publishing can invalidate cached pages. That handle only
// forwards to the app-wide cache provider, so holding it past the request is safe.
export const startSchedulerOnce = (context: APIContext) => {
  if (started) return;
  started = true;

  const flag = readEnv("CMS_SCHEDULER")?.trim().toLowerCase();
  if (flag !== "1" && flag !== "true") return;
  // Workers have their own scheduled() handler and don't keep timers alive between requests.
  if ((context.locals as { cfContext?: unknown }).cfContext) return;

  const cache = context.cache;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const { cms } = await import("virtual:kide/api");
      await runPublishJob(cms as never, cache);
      await runTasksJob(cms as never);
    } catch (error) {
      log.error("[kide] scheduler run failed:", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  void run();
  log.info("[kide] scheduler started (publish + tasks every 60s)");
};
