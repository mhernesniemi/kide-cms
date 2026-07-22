import type { AdminAuthConfig, AdminAuthSsoProviderConfig, CMSConfig } from "./define";

export type ResolvedAdminAuthConfig = {
  provider: "local" | "better-auth" | "workos" | "custom";
  password: {
    enabled: boolean;
    forgotPassword: boolean;
    emailVerification: boolean;
  };
  mfa: {
    totp: boolean;
    backupCodes: boolean;
    passkeys: boolean;
  };
  ssoProviders: AdminAuthSsoProviderConfig[];
};

export const customAuth = (provider: Extract<NonNullable<AdminAuthConfig["provider"]>, { kind: "custom" }>) => provider;

export const resolveAdminAuth = (config: CMSConfig): ResolvedAdminAuthConfig => {
  const auth = config.admin?.auth;
  const providerConfig = auth?.provider;
  const provider = typeof providerConfig === "object" ? "custom" : (providerConfig ?? "local");
  const passwordEnabled = auth?.password?.enabled ?? provider !== "workos";
  const forgotPassword = auth?.password?.forgotPassword ?? (provider === "local" || provider === "better-auth");

  return {
    provider,
    password: {
      enabled: passwordEnabled,
      forgotPassword: passwordEnabled && forgotPassword,
      emailVerification: auth?.password?.emailVerification ?? false,
    },
    mfa: {
      totp: auth?.mfa?.totp ?? false,
      backupCodes: auth?.mfa?.backupCodes ?? false,
      passkeys: auth?.mfa?.passkeys ?? false,
    },
    ssoProviders: auth?.sso?.providers ?? [],
  };
};

export const getSsoProvider = (config: CMSConfig, providerId: string) =>
  resolveAdminAuth(config).ssoProviders.find((provider) => provider.id === providerId) ?? null;
