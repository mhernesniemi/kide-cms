import type { AdminAuthConfig, AdminAuthSsoProviderConfig, CMSConfig } from "./define";

export type ResolvedAdminAuthConfig = {
  provider: "local" | "custom";
  password: {
    enabled: boolean;
    forgotPassword: boolean;
  };
  mfa: {
    totp: boolean;
    passkeys: boolean;
    require: boolean | string[];
  };
  ssoProviders: AdminAuthSsoProviderConfig[];
  ssoVerifyEveryMinutes: number;
  sessionDays: number;
};

export const customAuth = (provider: Extract<NonNullable<AdminAuthConfig["provider"]>, { kind: "custom" }>) => provider;

const SSO_ID = /^[a-z0-9][a-z0-9-]*$/;
const TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const resolveAdminAuth = (config: CMSConfig): ResolvedAdminAuthConfig => {
  const auth = config.admin?.auth;
  const provider = typeof auth?.provider === "object" ? "custom" : "local";
  const passwordEnabled = auth?.password?.enabled ?? true;
  const ssoProviders = auth?.sso?.providers ?? [];

  for (const sso of ssoProviders) {
    if (!SSO_ID.test(sso.id)) {
      throw new Error(`[kide] SSO provider id "${sso.id}" must be lowercase letters, digits and dashes.`);
    }
    if (sso.type === "microsoft" && !TENANT_GUID.test(sso.tenantId)) {
      throw new Error(
        `[kide] SSO provider "${sso.id}": tenantId must be the directory (tenant) GUID — ` +
          "multi-tenant endpoints (common/organizations) can't vouch for email addresses.",
      );
    }
    if (sso.provisioning === "jit" && !sso.allowedDomains?.length) {
      throw new Error(`[kide] SSO provider "${sso.id}" uses jit provisioning, which requires allowedDomains.`);
    }
  }
  if (new Set(ssoProviders.map((sso) => sso.id)).size !== ssoProviders.length) {
    throw new Error("[kide] SSO provider ids must be unique.");
  }

  return {
    provider,
    password: {
      enabled: passwordEnabled,
      forgotPassword: passwordEnabled && (auth?.password?.forgotPassword ?? true),
    },
    mfa: {
      totp: auth?.mfa?.totp ?? false,
      passkeys: auth?.mfa?.passkeys ?? false,
      require: auth?.mfa?.require ?? false,
    },
    ssoProviders,
    ssoVerifyEveryMinutes: Math.max(5, auth?.sso?.verifyEveryMinutes ?? 60),
    sessionDays: auth?.sessionDays ?? 30,
  };
};

export const getSsoProvider = (config: CMSConfig, providerId: string) =>
  resolveAdminAuth(config).ssoProviders.find((provider) => provider.id === providerId) ?? null;

/** Whether MFA enrollment is mandatory for a user with this role. */
export const mfaRequiredFor = (auth: ResolvedAdminAuthConfig, role: string) =>
  auth.mfa.totp && (auth.mfa.require === true || (Array.isArray(auth.mfa.require) && auth.mfa.require.includes(role)));

const emailDomain = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

/** SSO providers a user's email domain is bound to (`allowedDomains` + `enforce`). */
export const enforcedSsoProviders = (auth: ResolvedAdminAuthConfig, email: string) => {
  const domain = emailDomain(email);
  if (!domain) return [];
  return auth.ssoProviders.filter(
    (provider) =>
      provider.enforce !== false && (provider.allowedDomains ?? []).some((allowed) => allowed.toLowerCase() === domain),
  );
};

/** The provider a domain-bound user should be sent to, if any. */
export const enforcedSsoProvider = (auth: ResolvedAdminAuthConfig, email: string) =>
  enforcedSsoProviders(auth, email)[0] ?? null;
