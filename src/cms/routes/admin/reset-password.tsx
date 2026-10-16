import config from "virtual:kide/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../admin/components/ui/card";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import { AuthDocument } from "../../admin/layouts/AuthDocument";
import { definePage } from "../../admin/render/page";
import { MIN_PASSWORD_LENGTH, resolveAdminAuth } from "../../core";
import type { CmsContext } from "../context";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Password is required.",
  password: "Passwords do not match.",
  short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  invalid: "This reset link is invalid or expired.",
};

type Props = { token: string; errorMessage: string | null };

const load = ({ url, redirect }: CmsContext) => {
  if (!resolveAdminAuth(config).password.forgotPassword) return redirect("/admin/login");
  const error = url.searchParams.get("error");
  return {
    token: url.searchParams.get("token") ?? "",
    errorMessage: error ? (ERROR_MESSAGES[error] ?? null) : null,
  };
};

function ResetPasswordPage({ token, errorMessage }: Props) {
  return (
    <AuthDocument title="Choose new password | Kide CMS">
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Choose new password</CardTitle>
          <CardDescription>Set a new password for your account</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
          <form method="post" action="/api/cms/auth/reset-password" className="grid gap-4">
            <input type="hidden" name="token" value={token} />
            <div className="grid gap-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" required />
            </div>
            <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
              Reset password
            </button>
          </form>
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, ResetPasswordPage);
