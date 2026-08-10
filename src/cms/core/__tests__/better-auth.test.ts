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

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "test-secret-value-for-better-auth-integration";
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);
  const { statementsToExecute } = await pushSQLiteSchema({ ...generatedSchema }, db as never);
  for (const statement of statementsToExecute) sqlite.exec(statement);
  initSchema(generatedSchema as never);
  configureCmsRuntime({
    getDb: async () => db,
    storage: { putFile: async () => {}, getFile: async () => null, deleteFile: async () => {} },
  });
  resetAuth();
});

afterAll(() => {
  resetAuth();
  resetCmsRuntime();
  resetSchema();
  sqlite.close();
});

describe("Better Auth engine on cms_users", () => {
  it("signs up a user, storing identity in cms_users and the password in cms_accounts", async () => {
    const auth = await getAuth();
    const res = await auth.api.signUpEmail({
      body: { email: "alice@example.com", password: "correct horse battery staple", name: "Alice" },
    });
    expect(res.user.email).toBe("alice@example.com");

    // Identity landed in the canonical cms_users row, with Kide's text timestamps backfilled.
    const users = await db
      .select()
      .from(generatedSchema.cmsUsers)
      .where(eq(generatedSchema.cmsUsers.email, "alice@example.com"));
    expect(users).toHaveLength(1);
    expect(users[0]._createdAt).toBeTruthy();
    expect(users[0]._updatedAt).toBeTruthy();
    expect(users[0].role).toBe("editor"); // additionalField default
    expect(users[0].password).toBeNull(); // NOT stored on the user row

    // Credentials live in cms_accounts, hashed with Kide's pbkdf2 hasher.
    const accounts = await db
      .select()
      .from(generatedSchema.cmsAccounts)
      .where(eq(generatedSchema.cmsAccounts.userId, users[0]._id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe("credential");
    expect(accounts[0].password?.startsWith("pbkdf2:")).toBe(true);
  });

  it("signs in with the correct password and rejects a wrong one", async () => {
    const auth = await getAuth();
    await auth.api.signUpEmail({
      body: { email: "bob@example.com", password: "bob-secret-password", name: "Bob" },
    });

    const ok = await auth.api.signInEmail({
      body: { email: "bob@example.com", password: "bob-secret-password" },
      returnHeaders: true,
    });
    expect(ok.response.user.email).toBe("bob@example.com");
    const setCookie = ok.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();

    await expect(
      auth.api.signInEmail({ body: { email: "bob@example.com", password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("resolves an active session (with role) from the session cookie", async () => {
    const auth = await getAuth();
    await auth.api.signUpEmail({
      body: { email: "carol@example.com", password: "carol-secret-password", name: "Carol" },
    });
    const signIn = await auth.api.signInEmail({
      body: { email: "carol@example.com", password: "carol-secret-password" },
      returnHeaders: true,
    });
    const cookie = signIn.headers.get("set-cookie")!.split(";")[0];

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe("carol@example.com");
    expect((session?.user as { role?: string }).role).toBe("editor");
  });
});
