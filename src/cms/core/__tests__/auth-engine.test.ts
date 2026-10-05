/**
 * Admin auth on Better Auth, end to end against the generated fixture schema on an
 * in-memory SQLite DB: legacy migration, sessions, the users collection's password
 * paths, password reset, TOTP, `mfa.require`, and SSO against a mock OIDC provider.
 */
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as generatedSchema from "./fixtures/project/src/cms/.generated/schema";
import fixtureConfig from "./fixtures/config";
import { createCms } from "../api";
import { hashPassword } from "../auth";
import {
  applySsoRoleMapping,
  extensionAuthEndpoints,
  getAdminAuth,
  getSsoDenial,
  passwordResetDelivery,
  registerAuthConfig,
  resetAuthEngine,
  resolveAdminSession,
} from "../auth-engine";
import type { CMSConfig } from "../define";
import { configureCmsRuntime, resetCmsRuntime } from "../runtime";
import { initSchema, resetSchema } from "../schema";

const ORIGIN = "http://localhost:4321";
const DEV_SECRET = "kide-development-secret-do-not-use-in-production";
const schema = generatedSchema as Record<string, any>;

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let cms: Record<string, any>;
const sentResets: Array<{ to: string; url: string }> = [];

const withAuth = (auth: NonNullable<CMSConfig["admin"]>["auth"]): CMSConfig => ({
  ...fixtureConfig,
  admin: { ...fixtureConfig.admin, auth: { ...fixtureConfig.admin?.auth, ...auth } },
});

const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const requestWithCookie = (cookie: string) => new Request(`${ORIGIN}/admin`, { headers: { cookie } });

const signIn = async (email: string, password: string) => {
  const auth = await getAdminAuth(ORIGIN);
  return auth.api.signInEmail({
    body: { email, password },
    headers: new Headers({ origin: ORIGIN }),
    asResponse: true,
  }) as Promise<Response>;
};

const createUser = (email: string, password?: string, role = "editor") =>
  cms.users.create({ name: email.split("@")[0], email, role, ...(password ? { password } : {}) }, { _system: true });

beforeAll(async () => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
    email: {
      isEmailConfigured: () => true,
      sendInviteEmail: async () => true,
      sendPasswordResetEmail: async (to, url) => {
        sentResets.push({ to, url });
        return true;
      },
    },
  });
  cms = createCms(fixtureConfig) as Record<string, any>;
});

afterAll(() => {
  resetAuthEngine();
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("legacy migration", () => {
  it("moves users.password into a credential account, lowercases email and marks it verified", async () => {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "insert into cms_users (_id, name, email, role, password, _created_at, _updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("legacy-1", "Legacy", "Legacy.Admin@Client.fi", "admin", await hashPassword("old-password-1"), now, now);

    resetAuthEngine();
    registerAuthConfig(fixtureConfig);
    const response = await signIn("legacy.admin@client.fi", "old-password-1");
    expect(response.status).toBe(200);

    const row = sqlite.prepare("select * from cms_users where _id = 'legacy-1'").get() as Record<string, unknown>;
    expect(row.email).toBe("legacy.admin@client.fi");
    expect(row.password).toBeNull();
    expect(row._auth_email_verified).toBe(1);
    const account = sqlite
      .prepare("select provider_id, password from cms_auth_accounts where user_id = 'legacy-1'")
      .get() as Record<string, string>;
    expect(account.provider_id).toBe("credential");
    expect(account.password).toMatch(/^pbkdf2:/);
  });
});

describe("password sign-in and sessions", () => {
  beforeEach(() => registerAuthConfig(fixtureConfig));

  it("stores collection API passwords as credentials, not on the users row", async () => {
    const user = await createUser("Editor.One@Example.com", "editor-pass-1");
    const row = sqlite.prepare("select email, password from cms_users where _id = ?").get(user._id) as Record<
      string,
      unknown
    >;
    expect(row).toEqual({ email: "editor.one@example.com", password: null });
    expect(
      sqlite
        .prepare("select count(*) n from cms_auth_accounts where user_id = ? and provider_id = 'credential'")
        .get(user._id),
    ).toEqual({ n: 1 });
  });

  it("signs in and resolves the session to the Kide user", async () => {
    const response = await signIn("editor.one@example.com", "editor-pass-1");
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((c) => c.startsWith("kide.session_token="))).toBe(true);

    const session = await resolveAdminSession(requestWithCookie(cookieHeader(response)));
    expect(session?.user.email).toBe("editor.one@example.com");
    expect(session?.user.role).toBe("editor");
    expect(session?.mfaEnrollmentRequired).toBe(false);
    expect(Object.keys(session!.user).some((key) => key === "password" || key.startsWith("_auth"))).toBe(false);
  });

  it("rejects a wrong password and a forged cookie", async () => {
    expect((await signIn("editor.one@example.com", "wrong-password")).status).toBe(401);
    expect(await resolveAdminSession(requestWithCookie("kide.session_token=forged.signature"))).toBeNull();
  });

  it("keeps self sign-up closed", async () => {
    const auth = await getAdminAuth(ORIGIN);
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/cms/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "intruder@example.com", password: "intruder-pass", name: "Intruder" }),
      }),
    );
    expect(response.ok).toBe(false);
    expect(sqlite.prepare("select 1 from cms_users where email = 'intruder@example.com'").get()).toBeUndefined();
  });

  it("revokes sessions when a password is changed through the collection API", async () => {
    const user = await createUser("rotate@example.com", "first-pass-1");
    const cookie = cookieHeader(await signIn("rotate@example.com", "first-pass-1"));
    await cms.users.update(user._id, { password: "second-pass-2" }, { _system: true });

    expect(await resolveAdminSession(requestWithCookie(cookie))).toBeNull();
    expect((await signIn("rotate@example.com", "first-pass-1")).status).toBe(401);
    expect((await signIn("rotate@example.com", "second-pass-2")).status).toBe(200);
  });

  it("removes sessions and credentials with the user", async () => {
    const user = await createUser("leaving@example.com", "leaving-pass-1");
    await signIn("leaving@example.com", "leaving-pass-1");
    await cms.users.delete(user._id, { _system: true });
    for (const table of ["cms_auth_accounts", "cms_auth_sessions"]) {
      expect(sqlite.prepare(`select count(*) n from ${table} where user_id = ?`).get(user._id)).toEqual({ n: 0 });
    }
  });
});

describe("password reset", () => {
  beforeEach(() => registerAuthConfig(fixtureConfig));

  it("emails a Kide reset link, stores the token hashed, and revokes sessions on reset", async () => {
    await createUser("forgetful@example.com", "forgotten-pass-1");
    const oldSession = cookieHeader(await signIn("forgetful@example.com", "forgotten-pass-1"));

    const auth = await getAdminAuth(ORIGIN);
    await auth.api.requestPasswordReset({ body: { email: "forgetful@example.com" }, headers: new Headers() });
    const sent = sentResets.at(-1)!;
    expect(sent.to).toBe("forgetful@example.com");
    const resetUrl = new URL(sent.url);
    expect(resetUrl.pathname).toBe("/admin/reset-password");
    const token = resetUrl.searchParams.get("token")!;

    const identifiers = sqlite.prepare("select identifier from cms_auth_verifications").all() as Array<{
      identifier: string;
    }>;
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers.some((row) => row.identifier.includes(token))).toBe(false);

    await auth.api.resetPassword({ body: { newPassword: "remembered-pass-2", token }, headers: new Headers() });
    expect(await resolveAdminSession(requestWithCookie(oldSession))).toBeNull();
    expect((await signIn("forgetful@example.com", "remembered-pass-2")).status).toBe(200);

    const reuse = await auth.api.resetPassword({
      body: { newPassword: "another-pass-3", token },
      headers: new Headers(),
      asResponse: true,
    });
    expect(reuse.ok).toBe(false);
  });
});

describe("password reset delivery", () => {
  it("is email when an adapter is configured, the terminal in development, otherwise off", async () => {
    expect(passwordResetDelivery()).toBe("email");
    const { getCmsRuntime } = await import("../runtime");
    const runtime = getCmsRuntime();
    const email = runtime.email!;
    const nodeEnv = process.env.NODE_ENV;
    try {
      runtime.email = { ...email, isEmailConfigured: () => false };
      process.env.NODE_ENV = "development";
      expect(passwordResetDelivery()).toBe("console");
      process.env.NODE_ENV = "production";
      expect(passwordResetDelivery()).toBeNull();
    } finally {
      runtime.email = email;
      process.env.NODE_ENV = nodeEnv;
    }
  });
});

describe("two-factor authentication", () => {
  const currentCode = async (userId: string) => {
    const row = sqlite.prepare("select secret from cms_auth_two_factors where user_id = ?").get(userId) as {
      secret: string;
    };
    const secret = await symmetricDecrypt({ key: DEV_SECRET, data: row.secret });
    return createOTP(secret).totp();
  };

  it("enrolls TOTP and then asks for a code at sign-in", async () => {
    registerAuthConfig(fixtureConfig);
    const user = await createUser("careful@example.com", "careful-pass-1");
    const cookie = cookieHeader(await signIn("careful@example.com", "careful-pass-1"));
    const auth = await getAdminAuth(ORIGIN);

    const enabled = await auth.api.enableTwoFactor({
      body: { password: "careful-pass-1" },
      headers: new Headers({ cookie }),
    });
    expect(enabled.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(enabled.backupCodes.length).toBe(10);

    await auth.api.verifyTOTP({ body: { code: await currentCode(user._id) }, headers: new Headers({ cookie }) });
    expect(
      (sqlite.prepare("select _auth_two_factor_enabled e from cms_users where _id = ?").get(user._id) as { e: number })
        .e,
    ).toBe(1);

    const challenged = await signIn("careful@example.com", "careful-pass-1");
    expect((await challenged.json()).twoFactorRedirect).toBe(true);
    // Password alone clears any session cookie and only issues the short-lived two-factor cookie.
    expect(challenged.headers.getSetCookie().some((c) => /^kide\.session_token=[^;]/.test(c))).toBe(false);
    expect(challenged.headers.getSetCookie().some((c) => c.startsWith("kide.two_factor="))).toBe(true);

    const verified = (await auth.api.verifyTOTP({
      body: { code: await currentCode(user._id) },
      headers: new Headers({ cookie: cookieHeader(challenged) }),
      asResponse: true,
    })) as Response;
    expect(verified.status).toBe(200);
    const session = await resolveAdminSession(requestWithCookie(cookieHeader(verified)));
    expect(session?.user.id).toBe(user._id);
  });

  it("flags password users of a required role until they enroll", async () => {
    registerAuthConfig(withAuth({ mfa: { totp: true, require: ["editor"] } }));
    await createUser("unenrolled@example.com", "unenrolled-pass-1");
    const cookie = cookieHeader(await signIn("unenrolled@example.com", "unenrolled-pass-1"));
    expect((await resolveAdminSession(requestWithCookie(cookie)))?.mfaEnrollmentRequired).toBe(true);

    await createUser("admin-role@example.com", "admin-role-pass-1", "admin");
    const adminCookie = cookieHeader(await signIn("admin-role@example.com", "admin-role-pass-1"));
    expect((await resolveAdminSession(requestWithCookie(adminCookie)))?.mfaEnrollmentRequired).toBe(false);
  });
});

describe("single sign-on", () => {
  const idp = new OAuth2Server();
  let nextClaims: Record<string, unknown> = {};

  beforeAll(async () => {
    await idp.issuer.keys.generate("RS256");
    await idp.start(0, "127.0.0.1");
    idp.service.on("beforeTokenSigning", (token) => Object.assign(token.payload, nextClaims));
    idp.service.on("beforeUserinfo", (response) => Object.assign(response.body, nextClaims));
  });
  afterAll(() => idp.stop());

  const ssoConfig = () =>
    withAuth({
      sso: {
        providers: [
          {
            id: "corp",
            label: "Corp",
            type: "oidc",
            issuer: idp.issuer.url!,
            clientId: "kide",
            clientSecret: "secret",
            allowedDomains: ["corp.example"],
          },
          {
            id: "corp-jit",
            label: "Corp (JIT)",
            type: "oidc",
            issuer: idp.issuer.url!,
            clientId: "kide",
            clientSecret: "secret",
            allowedDomains: ["corp.example"],
            provisioning: "jit",
            role: "editor",
            mapRole: (claims) => ((claims.groups as string[] | undefined)?.includes("kide-admins") ? "admin" : null),
          },
        ],
      },
    });

  /** Drives start → identity provider → callback, like a browser following redirects. */
  const ssoSignIn = async (providerId: string, claims: Record<string, unknown>) => {
    nextClaims = claims;
    const auth = await getAdminAuth(ORIGIN);
    const start = (await auth.api.signInSocial({
      body: { provider: providerId, callbackURL: "/admin", errorCallbackURL: "/admin/login" },
      headers: new Headers({ origin: ORIGIN }),
      asResponse: true,
    })) as Response;
    const { url } = (await start.json()) as { url: string };
    const authorize = await fetch(url, { redirect: "manual" });
    const callback = new URL(authorize.headers.get("location")!);
    const response = await auth.handler(
      new Request(`${ORIGIN}${callback.pathname}${callback.search}`, { headers: { cookie: cookieHeader(start) } }),
    );
    const session = await resolveAdminSession(requestWithCookie(cookieHeader(response)));
    return { response, session, authorizeUrl: new URL(url) };
  };

  beforeEach(() => registerAuthConfig(ssoConfig()));

  it("links an invited user whose domain the provider is authoritative for", async () => {
    const user = await createUser("invited@corp.example");
    // Entra-style: no email_verified claim at all.
    const { session, authorizeUrl } = await ssoSignIn("corp", { sub: "corp-sub-1", email: "invited@corp.example" });
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(session?.user.id).toBe(user._id);
  });

  it("matches the provider subject on later sign-ins, even after an email change", async () => {
    const { session } = await ssoSignIn("corp", { sub: "corp-sub-1", email: "renamed@corp.example" });
    expect(session?.user.email).toBe("invited@corp.example");
  });

  it("refuses an identity with no Kide account under invite-only", async () => {
    const { response, session } = await ssoSignIn("corp", { sub: "corp-sub-2", email: "stranger@corp.example" });
    expect(session).toBeNull();
    expect(response.headers.get("location")).toContain("/admin/login?error=NOT_INVITED");
    expect(sqlite.prepare("select 1 from cms_users where email = 'stranger@corp.example'").get()).toBeUndefined();
  });

  it("won't link an unverified email outside the provider's domains", async () => {
    await createUser("victim@other.example");
    const { response, session } = await ssoSignIn("corp", {
      sub: "attacker",
      email: "victim@other.example",
      email_verified: false,
    });
    expect(session).toBeNull();
    expect(response.headers.get("location")).toContain("error=account_not_linked");
  });

  it("provisions jit users at allowed domains with the provider role", async () => {
    const { session } = await ssoSignIn("corp-jit", { sub: "jit-1", email: "newcomer@corp.example" });
    expect(session?.user.email).toBe("newcomer@corp.example");
    expect(session?.user.role).toBe("editor");
  });

  it("refuses jit users outside the allowed domains", async () => {
    const { response, session } = await ssoSignIn("corp-jit", {
      sub: "jit-2",
      email: "outsider@elsewhere.example",
      email_verified: true,
    });
    expect(session).toBeNull();
    expect(response.headers.get("location")).toContain("/admin/login?error=DOMAIN_NOT_ALLOWED");
  });

  it("maps ID-token claims to a role", async () => {
    const { session } = await ssoSignIn("corp-jit", {
      sub: "jit-3",
      email: "lead@corp.example",
      groups: ["kide-admins"],
    });
    const provider = ssoConfig().admin!.auth!.sso!.providers![1];
    await applySsoRoleMapping(provider, session!.user.id);
    const row = await db
      .select({ role: schema.cmsUsers.role })
      .from(schema.cmsUsers)
      .where(eq(schema.cmsUsers._id, session!.user.id));
    expect(row[0].role).toBe("admin");
  });

  describe("offboarding", () => {
    const makeStale = (email: string) =>
      sqlite
        .prepare(
          "update cms_auth_accounts set updated_at = ? where provider_id like 'corp%' and user_id = (select _id from cms_users where email = ?)",
        )
        .run(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), email);

    const answerRefreshWith = (statusCode: number, body: Record<string, unknown>) =>
      idp.service.once("beforeResponse", (response: { statusCode: number; body: unknown }) => {
        response.statusCode = statusCode;
        response.body = body;
      });

    const signedInCorpUser = async (email: string, sub: string) => {
      await createUser(email);
      const { response } = await ssoSignIn("corp", { sub, email });
      return requestWithCookie(cookieHeader(response));
    };

    it("stores the provider's refresh token encrypted", async () => {
      await signedInCorpUser("keeper@corp.example", "keeper");
      const row = sqlite.prepare("select refresh_token from cms_auth_accounts where account_id = 'keeper'").get() as {
        refresh_token: string;
      };
      expect(row.refresh_token).toBeTruthy();
      expect(row.refresh_token).not.toMatch(/^[0-9a-f-]{36}$/); // the mock issues UUIDs
    });

    it("re-checks a stale SSO session invisibly while the provider still vouches", async () => {
      const request = await signedInCorpUser("active@corp.example", "active");
      makeStale("active@corp.example");
      expect((await resolveAdminSession(request))?.user.email).toBe("active@corp.example");
      const row = sqlite.prepare("select updated_at from cms_auth_accounts where account_id = 'active'").get() as {
        updated_at: string;
      };
      expect(Date.now() - Date.parse(row.updated_at)).toBeLessThan(60_000);
    });

    it("ends every session when the provider refuses the user", async () => {
      const request = await signedInCorpUser("leaver@corp.example", "leaver");
      makeStale("leaver@corp.example");
      answerRefreshWith(400, { error: "invalid_grant", error_description: "User account is disabled." });

      expect(await resolveAdminSession(request)).toBeNull();
      expect(getSsoDenial(request)).toEqual({ kind: "revoked" });
      const userId = (
        sqlite.prepare("select _id from cms_users where email = 'leaver@corp.example'").get() as {
          _id: string;
        }
      )._id;
      expect(sqlite.prepare("select count(*) n from cms_auth_sessions where user_id = ?").get(userId)).toEqual({
        n: 0,
      });
      // A fresh request with the same cookie stays out.
      expect(await resolveAdminSession(new Request(request.url, { headers: request.headers }))).toBeNull();
    });

    it("keeps the session through a provider outage and retries later", async () => {
      const request = await signedInCorpUser("patient@corp.example", "patient");
      makeStale("patient@corp.example");
      answerRefreshWith(503, { error: "temporarily_unavailable" });

      expect((await resolveAdminSession(request))?.user.email).toBe("patient@corp.example");
      const row = sqlite.prepare("select updated_at from cms_auth_accounts where account_id = 'patient'").get() as {
        updated_at: string;
      };
      // Pushed to "check again in ~5 minutes", not marked as verified.
      const age = Date.now() - Date.parse(row.updated_at);
      expect(age).toBeGreaterThan(50 * 60 * 1000);
      expect(age).toBeLessThan(60 * 60 * 1000);
    });

    it("sends users without a refresh token back through the provider", async () => {
      const request = await signedInCorpUser("tokenless@corp.example", "tokenless");
      sqlite.prepare("update cms_auth_accounts set refresh_token = null where account_id = 'tokenless'").run();
      makeStale("tokenless@corp.example");
      expect(await resolveAdminSession(request)).toBeNull();
      expect(getSsoDenial(request)).toEqual({ kind: "reauth", providerId: "corp" });
    });

    it("refuses sessions of domain-bound users that aren't linked to the provider", async () => {
      await createUser("password-only@corp.example", "domain-pass-1");
      const response = await signIn("password-only@corp.example", "domain-pass-1");
      const request = requestWithCookie(cookieHeader(response));
      expect(await resolveAdminSession(request)).toBeNull();
      expect(getSsoDenial(request)).toEqual({ kind: "reauth", providerId: "corp" });
    });

    it("leaves users outside the bound domains alone", async () => {
      registerAuthConfig(
        withAuth({ sso: { providers: [{ ...ssoConfig().admin!.auth!.sso!.providers![0], enforce: false }] } }),
      );
      await createUser("free@corp.example", "free-pass-1");
      const response = await signIn("free@corp.example", "free-pass-1");
      expect((await resolveAdminSession(requestWithCookie(cookieHeader(response))))?.user.email).toBe(
        "free@corp.example",
      );
    });

    it("syncs the mapped role on a re-check", async () => {
      const { response } = await ssoSignIn("corp-jit", { sub: "promoted", email: "promoted@corp.example" });
      const request = requestWithCookie(cookieHeader(response));
      expect((await resolveAdminSession(request))?.user.role).toBe("editor");
      makeStale("promoted@corp.example");
      nextClaims = { sub: "promoted", email: "promoted@corp.example", groups: ["kide-admins"] };
      await resolveAdminSession(request);
      expect((await resolveAdminSession(new Request(request.url, { headers: request.headers })))?.user.role).toBe(
        "admin",
      );
    });
  });
});

describe("betterAuth extension endpoints", () => {
  it("routes endpoints of plugins the project adds, and only those", () => {
    const config = withAuth({
      mfa: { totp: true },
      betterAuth: (options) => ({
        ...options,
        plugins: [
          ...(options.plugins ?? []),
          { id: "custom", endpoints: { go: { path: "/custom/:id/go", options: { method: "POST" } } } },
        ],
      }),
    });
    const rules = extensionAuthEndpoints(config);
    const allows = (method: string, path: string) =>
      rules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));
    expect(allows("POST", "/custom/abc/go")).toBe(true);
    expect(allows("GET", "/custom/abc/go")).toBe(false);
    expect(allows("POST", "/custom/abc/go/extra")).toBe(false);
    expect(allows("POST", "/two-factor/enable")).toBe(false); // Kide's own plugins stay on Kide's list
  });

  it("adds nothing without the hook", () => {
    expect(extensionAuthEndpoints(fixtureConfig)).toEqual([]);
  });
});
