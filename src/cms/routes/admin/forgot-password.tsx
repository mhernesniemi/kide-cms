import config from "virtual:kide/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../admin/components/ui/card";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import { AuthDocument } from "../../admin/layouts/AuthDocument";
import { definePage } from "../../admin/render/page";
import { passwordResetDelivery, resolveAdminAuth } from "../../core";
import type { CmsContext } from "../context";

type Props = { delivery: ReturnType<typeof passwordResetDelivery>; status: string | null };

const load = ({ url, redirect }: CmsContext) => {
  if (!resolveAdminAuth(config).password.forgotPassword) return redirect("/admin/login");
  return { delivery: passwordResetDelivery(), status: url.searchParams.get("status") };
};

function ForgotPasswordPage({ delivery, status }: Props) {
  return (
    <AuthDocument title="Reset password | Kide CMS">
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            {delivery ? "Enter your email and we'll send a reset link" : "Reset by email isn't available"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "sent" && delivery && (
            <div className="border-border bg-muted mb-4 rounded-lg border px-3 py-2 text-sm">
              {delivery === "email"
                ? "If that account exists, a reset link has been sent."
                : "Email isn't set up, so if that account exists, its reset link was printed in the dev server's terminal."}
            </div>
          )}
          {delivery ? (
            <form method="post" action="/api/cms/auth/forgot-password" className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="admin@example.com" required autoFocus />
              </div>
              <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
                Send reset link
              </button>
              <a className="text-muted-foreground hover:text-foreground text-center text-sm" href="/admin/login">
                Back to sign in
              </a>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-muted-foreground text-sm">
                Password reset by email isn't set up for this site. Ask an administrator to help you get back in.
              </p>
              <a className="text-muted-foreground hover:text-foreground text-center text-sm" href="/admin/login">
                Back to sign in
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, ForgotPasswordPage);
