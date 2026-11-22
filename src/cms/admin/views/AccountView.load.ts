import config from "virtual:kide/config";
import { getCookie } from "../lib/cookies";
import {
  enforcedSsoProvider,
  getAccountSecurity,
  initDateFormat,
  MIN_PASSWORD_LENGTH,
  mfaRequiredFor,
  resolveAdminAuth,
} from "../../core";
import type { CmsContext } from "../../routes/context";

export async function loadAccountView(context: CmsContext) {
  const { url, locals, redirect } = context;
  initDateFormat(config, getCookie(context.request, "tz"));

  const user = locals.user;
  if (!user) return redirect("/admin/login");

  const auth = resolveAdminAuth(config);
  const security = await getAccountSecurity(user.id);
  // Domain-bound users sign in through their provider only; a stored password is unused.
  const managedBy = enforcedSsoProvider(auth, user.email);
  // Only what the page shows: the resolved auth config carries provider settings.
  return {
    user: { name: user.name, email: user.email, role: user.role },
    totp: Boolean(auth.mfa.totp),
    passkeys: Boolean(auth.mfa.passkeys),
    security: {
      twoFactorEnabled: security.twoFactorEnabled,
      ssoProviders: security.ssoProviders,
      passkeys: security.passkeys,
    },
    mfaRequired: mfaRequiredFor(auth, user.role),
    managedBy: managedBy ? { label: managedBy.label } : null,
    usesPassword: security.hasPassword && !managedBy,
    mustEnroll: url.searchParams.get("mfa") === "required" && !security.twoFactorEnabled,
    ssoLabels: Object.fromEntries(auth.ssoProviders.map((provider) => [provider.id, provider.label])),
    minPasswordLength: MIN_PASSWORD_LENGTH,
    dateLocale: config.admin?.dateFormat,
  };
}
