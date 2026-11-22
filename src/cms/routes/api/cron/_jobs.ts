import { pruneAuditLog, pruneRateLimits } from "../../../core";

type CacheInvalidator = { invalidate: (opts: { tags: string[] }) => void | Promise<void> };
type CronCms = {
  scheduled: { processPublishing: (cache?: CacheInvalidator) => Promise<{ published: number; unpublished: number }> };
  tasks: {
    tick: () => Promise<number>;
    drain: () => Promise<{ processed: number; succeeded: number; failed: number }>;
    prune: () => Promise<unknown>;
  };
};

// Shared by the cron endpoints and the in-process scheduler (CMS_SCHEDULER) so both run the same work.
export const runPublishJob = (cms: CronCms, cache?: CacheInvalidator) => cms.scheduled.processPublishing(cache);

export const runTasksJob = async (cms: CronCms) => {
  const scheduled = await cms.tasks.tick();
  const result = await cms.tasks.drain();
  await cms.tasks.prune();
  await pruneRateLimits();
  await pruneAuditLog();
  return { scheduled, ...result };
};
