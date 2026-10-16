import { eq } from "drizzle-orm";
import { getDb } from "virtual:kide/db";
import { validateInvite } from "virtual:kide/runtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../admin/components/ui/card";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import { AuthDocument } from "../../admin/layouts/AuthDocument";
import { definePage } from "../../admin/render/page";
import { MIN_PASSWORD_LENGTH } from "../../core";
import type { CmsContext } from "../context";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Name and password are required.",
  password: "Passwords do not match.",
  short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  expired: "This invite link has expired or already been used.",
  invalid: "This invite link has expired or already been used.",
};

type Props = { token: string; valid: boolean; userEmail: string; errorMessage: string | null };

const load = async ({ url }: CmsContext): Promise<Props> => {
  const token = url.searchParams.get("token") ?? "";
  const error = url.searchParams.get("error");
  let userEmail = "";
  let valid = false;
  if (token) {
    const invite = await validateInvite(token);
    if (invite) {
      valid = true;
      const db = await getDb();
      const schema = await import("virtual:kide/schema");
      const tables = schema.cmsTables as Record<string, { main: any }>;
      if (tables.users) {
        const rows = await db.select().from(tables.users.main).where(eq(tables.users.main._id, invite.userId)).limit(1);
        if (rows.length > 0) userEmail = String((rows[0] as any).email);
      }
    }
  }
  return { token, valid, userEmail, errorMessage: error ? (ERROR_MESSAGES[error] ?? null) : null };
};

function InvitePage({ token, valid, userEmail, errorMessage }: Props) {
  return (
    <AuthDocument title="Accept Invitation | Kide CMS" theme>
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
          <CardDescription>
            {valid ? `Complete your account for ${userEmail}` : "Accept your invitation to Kide CMS"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
          {valid ? (
            <form method="post" action="/api/cms/auth/invite" className="grid gap-4">
              <input type="hidden" name="_action" value="accept" />
              <input type="hidden" name="token" value={token} />
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" type="text" placeholder="Your name" required autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Repeat password"
                  required
                />
              </div>
              <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
                Create account
              </button>
            </form>
          ) : (
            !errorMessage && <p className="text-muted-foreground text-sm">No valid invitation token provided.</p>
          )}
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, InvitePage);
