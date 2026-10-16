import config from "virtual:kide/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../admin/components/ui/card";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import PasskeySignIn from "../../admin/components/PasskeySignIn";
import { AuthDocument } from "../../admin/layouts/AuthDocument";
import { Island } from "../../admin/render/island";
import { definePage } from "../../admin/render/page";
import { getSsoProvider, passwordResetDelivery, resolveAdminAuth } from "../../core";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Invalid email or password.",
  missing: "Email and password are required.",
  disabled: "Password login is disabled.",
  "rate-limited": "Too many attempts. Try again in a few minutes.",
  "two-factor-expired": "The sign-in took too long. Start again.",
  not_invited: "There's no Kide account for that user. Ask an admin to invite you.",
  domain_not_allowed: "That account's email domain isn't allowed here.",
  account_not_linked:
    "An account with this email exists, but your identity provider didn't confirm the address. Ask an admin to check the SSO setup.",
  signup_disabled: "There's no Kide account for that user. Ask an admin to invite you.",
  "sso-unknown": "That sign-in option doesn't exist.",
  "sso-unavailable": "Single sign-on isn't available right now. Try again later or contact an admin.",
  access_denied: "Sign-in was cancelled.",
  sso_access_revoked: "Your organization account no longer has access. Contact your administrator.",
};
const STATUS_MESSAGES: Record<string, string> = {
  "password-reset": "Your password was changed. Sign in with the new one.",
};

type Props = {
  errorMessage: string | null;
  statusMessage: string | null;
  forgotPassword: boolean;
};

const load = ({ url }: { url: URL }): Props => {
  // Better Auth reports SSO refusals as upper-case codes (NOT_INVITED); Kide's own are kebab-case.
  const rawError = url.searchParams.get("error");
  const error = rawError && rawError === rawError.toUpperCase() ? rawError.toLowerCase() : rawError;
  const requiredSso = error === "sso-required" ? getSsoProvider(config, url.searchParams.get("sso") ?? "") : null;
  const errorMessage = requiredSso
    ? `Your organization signs in with ${requiredSso.label}. Use the button above.`
    : error
      ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Try again.")
      : null;
  const status = url.searchParams.get("status");
  const auth = resolveAdminAuth(config);
  return {
    errorMessage,
    statusMessage: status ? (STATUS_MESSAGES[status] ?? null) : null,
    forgotPassword: Boolean(auth.password.forgotPassword && passwordResetDelivery()),
  };
};

function LoginPage({ errorMessage, statusMessage, forgotPassword }: Props) {
  const auth = resolveAdminAuth(config);
  const hasSso = auth.ssoProviders.length > 0;
  return (
    <AuthDocument title="Sign in | Kide CMS">
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {auth.password.enabled ? "Enter your credentials to continue" : "Continue with your organization account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div className="border-border bg-muted mb-4 rounded-lg border px-3 py-2 text-sm">{statusMessage}</div>
          )}
          {hasSso && (
            <div className="grid gap-3">
              {auth.ssoProviders.map((provider) => (
                <a
                  key={provider.id}
                  className={buttonVariants({
                    variant: auth.password.enabled ? "outline" : "default",
                    size: "lg",
                    className: "w-full",
                  })}
                  href={`/api/cms/auth/sso/${provider.id}/start`}
                >
                  Continue with {provider.label}
                </a>
              ))}
            </div>
          )}
          {auth.password.enabled && (
            <>
              {hasSso && (
                <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
                  <div className="bg-border h-px flex-1" />
                  <span>or</span>
                  <div className="bg-border h-px flex-1" />
                </div>
              )}
              <form method="post" action="/api/cms/auth/login" className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@example.com"
                    autoComplete="username webauthn"
                    required
                    autoFocus={!hasSso}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>
                    {forgotPassword && (
                      <a className="text-muted-foreground hover:text-foreground text-xs" href="/admin/forgot-password">
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
                  Sign in
                </button>
              </form>
            </>
          )}
          {auth.mfa.passkeys && <Island name="PasskeySignIn" component={PasskeySignIn} />}
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, LoginPage);
