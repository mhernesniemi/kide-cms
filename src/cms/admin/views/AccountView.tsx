import { AdminCard } from "../components/AdminCard";
import PasskeySettings from "../components/PasskeySettings";
import TwoFactorSettings from "../components/TwoFactorSettings";
import { buttonVariants } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Island } from "../render/island";
import type { loadAccountView } from "./AccountView.load";

export type AccountViewData = Exclude<Awaited<ReturnType<typeof loadAccountView>>, Response>;

export function AccountView({
  user,
  totp,
  passkeys,
  security,
  mfaRequired,
  managedBy,
  usesPassword,
  mustEnroll,
  ssoLabels,
  minPasswordLength,
  dateLocale,
}: AccountViewData) {
  return (
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
            <li key={id}>{ssoLabels[id] ?? id} (single sign-on)</li>
          ))}
          {security.passkeys.length > 0 && (
            <li>{security.passkeys.length === 1 ? "1 passkey" : `${security.passkeys.length} passkeys`}</li>
          )}
        </ul>
        <form method="post" action="/api/cms/auth/account" className="mt-4" data-kide-submit>
          <input type="hidden" name="_action" value="revoke-other-sessions" />
          <button className={buttonVariants({ variant: "outline" })} type="submit">
            Sign out on other devices
          </button>
        </form>
      </AdminCard>

      {usesPassword && (
        <AdminCard title="Password">
          <form method="post" action="/api/cms/auth/account" className="grid max-w-sm gap-4" data-kide-submit>
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
                placeholder={`Min ${minPasswordLength} characters`}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            </div>
            <div>
              <button className={buttonVariants()} type="submit">
                Change password
              </button>
            </div>
          </form>
        </AdminCard>
      )}

      {totp && usesPassword && (
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

      {passkeys && (
        <AdminCard
          title="Passkeys"
          description="Sign in with your fingerprint, face or device PIN instead of a password."
        >
          <Island
            name="PasskeySettings"
            component={PasskeySettings}
            props={{ passkeys: security.passkeys, dateLocale }}
          />
        </AdminCard>
      )}
    </section>
  );
}
