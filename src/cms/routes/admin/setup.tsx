import { eq } from "drizzle-orm";
import { getDb } from "virtual:kide/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../admin/components/ui/card";
import { Input } from "../../admin/components/ui/input";
import { Label } from "../../admin/components/ui/label";
import { buttonVariants } from "../../admin/components/ui/button";
import { AuthDocument } from "../../admin/layouts/AuthDocument";
import { definePage } from "../../admin/render/page";
import { MIN_PASSWORD_LENGTH } from "../../core";
import type { CmsContext } from "../context";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "All fields are required.",
  password: "Passwords do not match.",
  short: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
};

const load = async ({ url, redirect }: CmsContext) => {
  // Setup is done once an admin exists — seeded editors must not close this door.
  const db = await getDb();
  const schema = await import("virtual:kide/schema");
  const tables = schema.cmsTables as Record<string, { main: any }>;
  if (tables.users) {
    const rows = await db.select().from(tables.users.main).where(eq(tables.users.main.role, "admin")).limit(1);
    if (rows.length > 0) return redirect("/admin/login");
  }
  const error = url.searchParams.get("error");
  return { errorMessage: error ? (ERROR_MESSAGES[error] ?? null) : null };
};

function SetupPage({ errorMessage }: { errorMessage: string | null }) {
  return (
    <AuthDocument title="Setup | Kide CMS">
      <h1 className="text-center text-xl font-semibold tracking-tight">Kide CMS</h1>
      <Card>
        <CardHeader>
          <CardTitle>Create admin account</CardTitle>
          <CardDescription>This will be the first user with admin privileges</CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-lg border px-3 py-2 text-sm">
              {errorMessage}
            </div>
          )}
          <form method="post" action="/api/cms/auth/setup" className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" type="text" placeholder="Your name" autoComplete="off" required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="admin@example.com" autoComplete="off" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                autoComplete="new-password"
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
                autoComplete="new-password"
                required
              />
            </div>
            <button className={buttonVariants({ size: "lg", className: "w-full" })} type="submit">
              Create account
            </button>
          </form>
        </CardContent>
      </Card>
    </AuthDocument>
  );
}

export const GET = definePage(load, SetupPage);
