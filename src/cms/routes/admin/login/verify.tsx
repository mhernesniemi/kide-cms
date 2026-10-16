import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../admin/components/ui/card";
import { Input } from "../../../admin/components/ui/input";
import { Label } from "../../../admin/components/ui/label";
import { buttonVariants } from "../../../admin/components/ui/button";
import { AuthDocument } from "../../../admin/layouts/AuthDocument";
import { definePage } from "../../../admin/render/page";
import type { CmsContext } from "../../context";

type Props = { useBackupCode: boolean; errorMessage: string | null };

const load = ({ request, url, redirect }: CmsContext) => {
  // Reached only mid-sign-in: Better Auth's short-lived two-factor cookie must be present.
  if (!/(?:^|;\s*)(?:__Secure-)?kide\.two_factor=/.test(request.headers.get("cookie") ?? "")) {
    return redirect("/admin/login?error=two-factor-expired");
  }
  const useBackupCode = url.searchParams.get("method") === "backup";
  const ERROR_MESSAGES: Record<string, string> = {
    missing: "Enter the code.",
    invalid: useBackupCode ? "That backup code isn't valid." : "That code isn't valid. Check the time on your device.",
    "rate-limited": "Too many attempts. Try again in a few minutes.",
  };
  const error = url.searchParams.get("error");
  return { useBackupCode, errorMessage: error ? (ERROR_MESSAGES[error] ?? null) : null };
};

function VerifyPage({ useBackupCode, errorMessage }: Props) {
  return (
    <AuthDocument title="Two-factor authentication | Kide CMS">
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            {useBackupCode
              ? "Enter one of the backup codes you saved when you set up two-factor authentication."
              : "Enter the 6-digit code from your authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
          <form method="post" action="/api/cms/auth/login/verify" className="grid gap-4">
            <input type="hidden" name="method" value={useBackupCode ? "backup" : "totp"} />
            <div className="grid gap-2">
              <Label htmlFor="code">{useBackupCode ? "Backup code" : "Code"}</Label>
              <Input
                id="code"
                name="code"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={useBackupCode ? undefined : "[0-9 ]*"}
                required
                autoFocus
              />
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input type="checkbox" name="trustDevice" className="accent-primary size-4" />
              Trust this device for 30 days
            </label>
            <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
              Verify
            </button>
            <a
              className="text-muted-foreground hover:text-foreground text-center text-sm"
              href={useBackupCode ? "/admin/login/verify" : "/admin/login/verify?method=backup"}
            >
              {useBackupCode ? "Use your authenticator app instead" : "Use a backup code instead"}
            </a>
          </form>
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, VerifyPage);
