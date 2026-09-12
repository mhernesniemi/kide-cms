declare module "virtual:kide/custom-fields" {
  export const customFields: Record<string, any>;
}

declare module "virtual:kide/config" {
  const config: import("../core").CMSConfig;
  export default config;
}

declare module "virtual:kide/api" {
  const cms: Record<string, any> & { meta: any; scheduled: any; tasks: any };
  export { cms };
}

declare module "virtual:kide/schema" {
  const cmsTables: Record<string, { main: any; translations?: any }>;
  export const cmsSessions: any;
  export const cmsPasswordResets: any;
  export const cmsRateLimits: any;
  export { cmsTables };
}

declare module "virtual:kide/runtime" {
  export const initCmsRuntime: () => void;
  export {
    getSessionUser,
    destroySession,
    clearSessionCookie,
    verifyPassword,
    hashToken,
    hashPassword,
    createSession,
    setSessionCookie,
    validateSession,
    createInvite,
    validateInvite,
    consumeInvite,
    createPasswordReset,
    validatePasswordReset,
    consumePasswordReset,
    SESSION_COOKIE_NAME,
    acquireLock,
    releaseLock,
    isAiEnabled,
    getAiModel,
    streamAltText,
    streamSeoDescription,
    streamTranslation,
    assets,
    folders,
    stripMissingAssetImages,
    findAssetUsage,
    countAssetUsage,
    AssetInUseError,
    createCms,
    recordAudit,
    logAudit,
    pruneAuditLog,
    auditRequestMeta,
    tokenReference,
    collaboration,
    search,
    indexDocument,
    removeDocument,
    reindexAll,
    readEnv,
    peekRateLimit,
    hitRateLimit,
    recordRateLimit,
    clearRateLimit,
    pruneRateLimits,
    getEmail,
  } from "../core";
}

declare module "virtual:kide/block-renderer" {
  const BlockRenderer: any;
  export default BlockRenderer;
}

declare module "virtual:kide/content-renderer" {
  const ContentRenderer: any;
  export default ContentRenderer;
}

declare module "virtual:kide/db" {
  export function getDb(): Promise<any>;
}

declare module "virtual:kide/storage" {
  export function putFile(storagePath: string, data: ArrayBuffer | Uint8Array): Promise<void>;
  export function getFile(storagePath: string): Promise<ArrayBuffer | null>;
  export function getFileStream(storagePath: string): Promise<{ body: ReadableStream; size: number } | null>;
  export function deleteFile(storagePath: string): Promise<void>;
  /** Cloudflare profile only: resize an upload with the Images binding. Absent on Node. */
  export const resizeImage:
    | ((
        request: Request,
        storagePath: string,
        options: {
          width?: number;
          height?: number;
          format?: string;
          quality?: number;
          focalX?: number | null;
          focalY?: number | null;
        },
      ) => Promise<Response | null>)
    | undefined;
}

declare module "virtual:kide/email" {
  export function sendInviteEmail(to: string, inviteUrl: string): Promise<boolean>;
  export function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean>;
  export function sendFormSubmissionEmail(
    to: string,
    formTitle: string,
    data: Record<string, unknown>,
  ): Promise<boolean>;
  export function isEmailConfigured(): boolean;
}
