declare module "virtual:kide/custom-fields" {
  export const customFields: Record<string, any>;
}

declare module "virtual:kide/config" {
  const config: import("@/cms/core").CMSConfig;
  export default config;
}

declare module "virtual:kide/api" {
  const cms: Record<string, any> & { meta: any; scheduled: any };
  export { cms };
}

declare module "virtual:kide/schema" {
  const cmsTables: Record<string, { main: any; translations?: any }>;
  export { cmsTables };
}

declare module "virtual:kide/runtime" {
  export const initCmsRuntime: () => void;
  export {
    getSessionUser,
    destroySession,
    clearSessionCookie,
    verifyPassword,
    hashPassword,
    createSession,
    setSessionCookie,
    validateSession,
    createInvite,
    validateInvite,
    consumeInvite,
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
    createCms,
    recordAudit,
    pruneAuditLog,
    auditRequestMeta,
    search,
    indexDocument,
    removeDocument,
    reindexAll,
  } from "@/cms/core";
}

declare module "virtual:kide/block-renderer" {
  const BlockRenderer: any;
  export default BlockRenderer;
}

declare module "virtual:kide/db" {
  export function getDb(): Promise<any>;
}

declare module "virtual:kide/email" {
  export function sendInviteEmail(to: string, inviteUrl: string): Promise<boolean>;
  export function sendFormSubmissionEmail(
    to: string,
    formTitle: string,
    data: Record<string, unknown>,
  ): Promise<boolean>;
  export function isEmailConfigured(): boolean;
}
