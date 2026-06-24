export type CmsStorageAdapter = {
  putFile: (storagePath: string, data: ArrayBuffer | Uint8Array) => Promise<void>;
  getFile: (storagePath: string) => Promise<ArrayBuffer | null>;
  deleteFile: (storagePath: string) => Promise<void>;
};

export type CmsEmailAdapter = {
  sendInviteEmail: (to: string, inviteUrl: string) => Promise<boolean>;
  isEmailConfigured: () => boolean;
};

export type CmsRuntimeConfig = {
  getDb: () => Promise<any>;
  closeDb?: () => void | Promise<void>;
  storage: CmsStorageAdapter;
  email?: CmsEmailAdapter;
  env?: (key: string) => string | undefined;
};

let runtime: CmsRuntimeConfig | null = null;

const runtimeError = () =>
  new Error(
    "@/cms/core runtime not initialized. Call configureCmsRuntime(...) and initSchema(...) from your app before using runtime APIs.",
  );

export const configureCmsRuntime = (config: CmsRuntimeConfig) => {
  runtime = config;
};

export const resetCmsRuntime = () => {
  runtime = null;
};

export const getCmsRuntime = (): CmsRuntimeConfig => {
  if (!runtime) throw runtimeError();
  return runtime;
};

export const getDb = () => getCmsRuntime().getDb();

// Returns the adapter's result so `await closeDb()` waits for teardown
// (on Cloudflare this disposes the local platform proxy used by Node scripts).
export const closeDb = (): void | Promise<void> => getCmsRuntime().closeDb?.();

export const getStorage = (): CmsStorageAdapter => getCmsRuntime().storage;

export const getEmail = (): CmsEmailAdapter => {
  const email = getCmsRuntime().email;
  return (
    email ?? {
      sendInviteEmail: async () => false,
      isEmailConfigured: () => false,
    }
  );
};

export const readEnv = (key: string): string | undefined => getCmsRuntime().env?.(key) ?? process.env[key];

// --- background task tracking ----------------------------------------------
// Search indexing and audit writes are dispatched fire-and-forget so requests
// don't wait on them. Register them here so a one-shot script (or a Worker
// using waitUntil) can flush them before tearing down its DB/storage — without
// this, disposing the local platform proxy mid-write throws ERR_DISPOSED.

const pendingTasks = new Set<Promise<unknown>>();

/** Track a fire-and-forget promise so it can be awaited later via flushTasks(). */
export const trackTask = <T>(task: Promise<T>): Promise<T> => {
  pendingTasks.add(task);
  void task.catch(() => {}).finally(() => pendingTasks.delete(task));
  return task;
};

/** Await all currently-tracked background tasks (settling, never throwing). */
export const flushTasks = async (): Promise<void> => {
  while (pendingTasks.size) {
    await Promise.allSettled([...pendingTasks]);
  }
};
