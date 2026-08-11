import { AsyncLocalStorage } from "node:async_hooks";

export type RequestScope = {
  /** Keep background work alive until the response is flushed (Cloudflare waitUntil / Node no-op). */
  defer: (task: Promise<unknown>) => void;
};

const storage = new AsyncLocalStorage<RequestScope>();

/** Run `fn` inside a request scope so deferred work routes to this request only. */
export const runWithRequestScope = <T>(scope: RequestScope, fn: () => T): T => storage.run(scope, fn);

// Fallback outside a request (scripts) — drained by flushTasks(), never crosses requests.
const scriptTasks = new Set<Promise<unknown>>();

/** Defer fire-and-forget work: to the active request scope, or scriptTasks outside one. */
export const trackTask = <T>(task: Promise<T>): Promise<T> => {
  const scope = storage.getStore();
  if (scope) {
    scope.defer(task.catch(() => {}));
  } else {
    scriptTasks.add(task);
    void task.catch(() => {}).finally(() => scriptTasks.delete(task));
  }
  return task;
};

/** Await all script-level deferred tasks (used by createCmsContext before dispose). */
export const flushTasks = async (): Promise<void> => {
  while (scriptTasks.size) {
    await Promise.allSettled([...scriptTasks]);
  }
};
