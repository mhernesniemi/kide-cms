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
  closeDb?: () => void;
  storage: CmsStorageAdapter;
  email?: CmsEmailAdapter;
  env?: (key: string) => string | undefined;
};

let runtime: CmsRuntimeConfig | null = null;

const runtimeError = () =>
  new Error(
    "@kide/core runtime not initialized. Call configureCmsRuntime(...) and initSchema(...) from your app before using runtime APIs.",
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

export const closeDb = () => {
  getCmsRuntime().closeDb?.();
};

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
