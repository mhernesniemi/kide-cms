import { describe, expect, it } from "vitest";

import { clearSessionCookie, hashPassword, SESSION_COOKIE_NAME, setSessionCookie, verifyPassword } from "../auth";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("password-one");
    expect(await verifyPassword(hash, "password-two")).toBe(false);
  });

  it("produces unique salts (same password, different hashes)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    // ...but both verify
    expect(await verifyPassword(a, "same")).toBe(true);
    expect(await verifyPassword(b, "same")).toBe(true);
  });

  it("uses the pbkdf2 format with iteration count", () => {
    return hashPassword("x").then((hash) => {
      const [scheme, iterations, salt, digest] = hash.split(":");
      expect(scheme).toBe("pbkdf2");
      expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
      expect(salt.length).toBeGreaterThan(0);
      expect(digest.length).toBeGreaterThan(0);
    });
  });

  it("returns false for malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("", "x")).toBe(false);
    expect(await verifyPassword("pbkdf2", "x")).toBe(false);
    expect(await verifyPassword("pbkdf2:100000", "x")).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("Secret");
    expect(await verifyPassword(hash, "secret")).toBe(false);
  });
});

describe("session cookies", () => {
  it("sets an HttpOnly, SameSite=Strict cookie with expiry", () => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const cookie = setSessionCookie("token123", expiresAt);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=token123`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Expires=");
  });

  it("clears the cookie with Max-Age=0", () => {
    const cookie = clearSessionCookie();
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cookie).toContain("Max-Age=0");
  });
});
