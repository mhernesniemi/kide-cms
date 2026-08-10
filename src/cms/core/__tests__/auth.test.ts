import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../auth";

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

  it("rejects a hostile iteration count and invalid base64 without spinning or throwing", async () => {
    expect(await verifyPassword("pbkdf2:99999999999:c2FsdA==:ZGln", "x")).toBe(false); // over the iteration cap
    expect(await verifyPassword("pbkdf2:100000:!!!notbase64!!!:ZGln", "x")).toBe(false); // bad base64 salt
    expect(await verifyPassword("scrypt:100000:c2FsdA==:ZGln", "x")).toBe(false); // wrong scheme
  });

  it("bounds password length on hash and verify", async () => {
    await expect(hashPassword("a".repeat(5000))).rejects.toThrow(/maximum length/);
    const hash = await hashPassword("normal");
    expect(await verifyPassword(hash, "a".repeat(5000))).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("Secret");
    expect(await verifyPassword(hash, "secret")).toBe(false);
  });
});
