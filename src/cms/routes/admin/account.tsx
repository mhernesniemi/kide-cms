import config from "virtual:kide/config";
import { AdminCard } from "../../admin/components/AdminCard";
import PasskeySettings from "../../admin/components/PasskeySettings";
import TwoFactorSettings from "../../admin/components/TwoFactorSettings";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import { AdminLayout, loadAdminLayout, type AdminLayoutData } from "../../admin/layouts/AdminLayout";
import { canRead } from "../../admin/lib/access";
import { Island } from "../../admin/render/island";
import { definePage, getCookie } from "../../admin/render/page";
import {
  enforcedSsoProvider,
  getAccountSecurity,
  initDateFormat,
  MIN_PASSWORD_LENGTH,
  mfaRequiredFor,
  resolveAdminAuth,
} from "../../core";
import type { CmsContext } from "../context";

const load = async (context: CmsContext) => {
  const { url, locals, redirect } = context;
  initDateFormat(config, getCookie(context.request, "tz"));

  const user = locals.user;
  if (!user) return redirect("/admin/login");

  const auth = resolveAdminAuth(config);
  const security = await getAccountSecurity(user.id);
  const mfaRequired = mfaRequiredFor(auth, user.role);
  // Domain-bound users sign in through their provider only; a stored password is unused.
  const managedBy = enforcedSsoProvider(auth, user.email);
  const usesPassword = security.hasPassword && !managedBy;
  const mustEnroll = url.searchParams.get("mfa") === "required" && !security.twoFactorEnabled;
  const ssoLabels = new Map(auth.ssoProviders.map((provider) => [provider.id, provider.label]));
  const accessibleCollections = config.collections.filter((c) => canRead(config, user, c.slug));
  const layout: AdminLayoutData = await loadAdminLayout(context);
  return {
    layout,
    user,
    auth,
    security,
    mfaRequired,
    managedBy,
    usesPassword,
    mustEnroll,
    ssoLabels,
    accessibleCollections,
  };
};

type Props = Exclude<Awaited<ReturnType<typeof load>>, Response>;

function AccountPage({
  layout,
  user,
  auth,
  security,
  mfaRequired,
  managedBy,
  usesPassword,
  mustEnroll,
  ssoLabels,
  accessibleCollections,
}: Props) {
  return (
    <AdminLayout
      layout={layout}
      title="Account | Kide CMS"
      collections={accessibleCollections}
      activeCollection="account"
    >
      <section className="max-w-3xl space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Account &amp; security</h1>
          <p className="text-muted-foreground text-sm">
            {user.name} · {user.email} · {user.role}
          </p>
        </div>

        {mustEnroll && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-100">
            Your role requires two-factor authentication. Set up an authenticator app to continue to the admin.
          </div>
        )}

        <AdminCard
          title="Sign-in methods"
          description={managedBy ? `Your organization manages your sign-in through ${managedBy.label}.` : undefined}
        >
          <ul className="grid gap-2 text-sm">
            {usesPassword && <li>Email and password</li>}
            {security.ssoProviders.map((id) => (
              <li key={id}>{ssoLabels.get(id) ?? id} (single sign-on)</li>
            ))}
            {security.passkeys.length > 0 && (
              <li>{security.passkeys.length === 1 ? "1 passkey" : `${security.passkeys.length} passkeys`}</li>
            )}
          </ul>
          <form method="post" action="/api/cms/auth/account" className="mt-4">
            <input type="hidden" name="_action" value="revoke-other-sessions" />
            <button className={buttonVariants({ variant: "outline" })} type="submit">
              Sign out on other devices
            </button>
          </form>
        </AdminCard>

        {usesPassword && (
          <AdminCard title="Password">
            <form method="post" action="/api/cms/auth/account" className="grid max-w-sm gap-4">
              <input type="hidden" name="_action" value="change-password" />
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <button className={buttonVariants()} type="submit">
                  Change password
                </button>
              </div>
            </form>
          </AdminCard>
        )}

        {auth.mfa.totp && usesPassword && (
          <AdminCard
            title="Two-factor authentication"
            description={
              security.twoFactorEnabled
                ? "On — signing in with your password also asks for a code from your authenticator app."
                : "Add a code from an authenticator app to every password sign-in."
            }
          >
            <Island
              name="TwoFactorSettings"
              component={TwoFactorSettings}
              props={{ enabled: security.twoFactorEnabled, required: mfaRequired }}
            />
          </AdminCard>
        )}

        {auth.mfa.passkeys && (
          <AdminCard
            title="Passkeys"
            description="Sign in with your fingerprint, face or device PIN instead of a password."
          >
            <Island
              name="PasskeySettings"
              component={PasskeySettings}
              props={{ passkeys: security.passkeys, dateLocale: config.admin?.dateFormat }}
            />
          </AdminCard>
        )}
      </section>
    </AdminLayout>
  );
}

export const GET = definePage(load, AccountPage);
