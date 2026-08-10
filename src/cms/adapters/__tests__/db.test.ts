import { afterEach, describe, expect, it } from "vitest";

import { isBenignMigrationError } from "../db";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("isBenignMigrationError", () => {
  it("tolerates the push-created 'already exists' state in production", () => {
    process.env.NODE_ENV = "production";
    expect(isBenignMigrationError(new Error("table posts already exists"))).toBe(true);
    expect(isBenignMigrationError(new Error("index cms_search_idx already exists"))).toBe(true);
  });

  it("rejects a genuinely broken migration in production", () => {
    process.env.NODE_ENV = "production";
    expect(isBenignMigrationError(new Error("no such column: foo"))).toBe(false);
    expect(isBenignMigrationError(new Error('near "CRETE": syntax error'))).toBe(false);
    expect(isBenignMigrationError("some non-Error value")).toBe(false);
  });

  it("tolerates everything in development, where the schema comes from drizzle-kit push", () => {
    process.env.NODE_ENV = "development";
    expect(isBenignMigrationError(new Error("no such column: foo"))).toBe(true);
  });
});
