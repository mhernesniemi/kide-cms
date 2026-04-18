import {
  configureCmsRuntime,
  initSchema,
  createCms,
  assets,
  folders,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  getSessionUser,
  createInvite,
  validateInvite,
  consumeInvite,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  acquireLock,
  releaseLock,
  isAiEnabled,
  getAiModel,
  streamAltText,
  streamSeoDescription,
  streamTranslation,
} from "@/cms/core";

import * as schema from "../.generated/schema";
import { closeDb, getDb } from "../adapters/db";
import { deleteFile, getFile, putFile } from "../adapters/storage";
import { isEmailConfigured, sendInviteEmail } from "../adapters/email";

let initialized = false;

export const initCmsRuntime = () => {
  if (initialized) return;

  initSchema(schema);
  configureCmsRuntime({
    getDb,
    closeDb,
    storage: { putFile, getFile, deleteFile },
    email: { sendInviteEmail, isEmailConfigured },
    env: (key) =>
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[key] ?? process.env[key],
  });

  initialized = true;
};

initCmsRuntime();

export {
  createCms,
  assets,
  folders,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  getSessionUser,
  createInvite,
  validateInvite,
  consumeInvite,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  acquireLock,
  releaseLock,
  isAiEnabled,
  getAiModel,
  streamAltText,
  streamSeoDescription,
  streamTranslation,
};
