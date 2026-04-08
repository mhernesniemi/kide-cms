declare module "virtual:kide/custom-fields" {
  export const customFields: Record<string, any>;
}

declare module "virtual:kide/config" {
  import type { CmsConfig } from "@kide/core";
  const config: CmsConfig;
  export default config;
}

declare module "virtual:kide/api" {
  const cms: Record<string, any> & { meta: any };
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
  } from "@kide/core";
}

declare module "virtual:kide/blocks" {
  export function renderBlock(block: Record<string, any>): string;
  export function renderBlocks(blocks: Array<Record<string, any>>): string;
}

declare module "virtual:kide/db" {
  export function getDb(): Promise<any>;
}

declare module "virtual:kide/email" {
  export function sendInviteEmail(options: { to: string; inviteUrl: string }): Promise<void>;
  export function isEmailConfigured(): boolean;
}
