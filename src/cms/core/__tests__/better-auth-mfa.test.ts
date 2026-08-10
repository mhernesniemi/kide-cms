import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as generatedSchema from "@/cms/.generated/schema";
import { getAuth, resetAuth } from "../better-auth";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

// Runtime configured with TOTP enabled and one OIDC provider, so the engine loads the
// two-factor + generic-oauth plugins.
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-value-for-mfa-integration";
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
    authConfig: () => ({
      provider: "better-auth",
      password: { enabled: true, forgotPassword: true, emailVerification: false },
      mfa: { totp: true, backupCodes: true, passkeys: false },
      ssoProviders: [
        {
          id: "acme",
          label: "Acme SSO",
          type: "oidc",
          issuer: "https://id.acme.test",
          clientId: "kide",
          clientSecret: "secret",
          allowedDomains: ["acme.test"],
          role: "editor",
        },
      ],
    }),
  });
  resetAuth();
});

afterAll(() => {
  resetAuth();
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("Better Auth engine with MFA + OIDC plugins", () => {
  it("enrolls TOTP for a signed-in user and stores it in cms_two_factors", async () => {
    const auth = await getAuth();
    const signup = (await auth.api.signUpEmail({
      body: { email: "totp@acme.test", password: "totp-user-password", name: "Totp" },
      returnHeaders: true,
    })) as { headers: Headers; response: { user: { id: string } } };
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const userId = signup.response.user.id;

    const enrolled = (await auth.api.enableTwoFactor({
      body: { password: "totp-user-password" },
      headers: new Headers({ cookie }),
    })) as { totpURI: string; backupCodes: string[] };

    expect(enrolled.totpURI.startsWith("otpauth://totp/")).toBe(true);
    expect(enrolled.backupCodes.length).toBeGreaterThan(0);

    const rows = await db
      .select()
      .from(generatedSchema.cmsTwoFactors)
      .where(eq(generatedSchema.cmsTwoFactors.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].secret).toBeTruthy();
    expect(rows[0].backupCodes).toBeTruthy();
  });

  it("challenges the second factor on a password sign-in once TOTP is enabled", async () => {
    const auth = await getAuth();
    const signup = (await auth.api.signUpEmail({
      body: { email: "challenge@acme.test", password: "challenge-password", name: "Chal" },
      returnHeaders: true,
    })) as { headers: Headers; response: { user: { id: string } } };
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const userId = signup.response.user.id;

    await auth.api.enableTwoFactor({ body: { password: "challenge-password" }, headers: new Headers({ cookie }) });
    // Simulate the user having completed first-code verification (fully enrolled).
    await db
      .update(generatedSchema.cmsUsers)
      .set({ twoFactorEnabled: true })
      .where(eq(generatedSchema.cmsUsers._id, userId));
    await db
      .update(generatedSchema.cmsTwoFactors)
      .set({ verified: true })
      .where(eq(generatedSchema.cmsTwoFactors.userId, userId));

    // A fresh password sign-in must NOT return a full session — it must ask for the 2nd factor.
    const res = (await auth.api.signInEmail({
      body: { email: "challenge@acme.test", password: "challenge-password" },
    })) as { twoFactorRedirect?: boolean; token?: string };
    expect(res.twoFactorRedirect).toBe(true);
    expect(res.token).toBeUndefined();
  });

  it("exposes the generic-oauth sign-in endpoint (plugin loaded)", async () => {
    const auth = await getAuth();
    // A bogus provider id must be rejected by the plugin — proving the endpoint is mounted
    // rather than 404-ing as an unknown route.
    await expect(
      auth.api.signInWithOAuth2({ body: { providerId: "does-not-exist", callbackURL: "/admin" } }),
    ).rejects.toThrow();
  });
});
