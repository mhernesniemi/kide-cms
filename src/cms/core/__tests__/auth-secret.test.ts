import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAuthSecret } from "../auth-engine";

describe("resolveAuthSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers KIDE_SECRET over the legacy names", () => {
    vi.stubEnv("KIDE_SECRET", "new");
    vi.stubEnv("KIDE_AUTH_SECRET", "legacy");
    vi.stubEnv("BETTER_AUTH_SECRET", "better-auth");
    expect(resolveAuthSecret()).toBe("new");
  });

  it("falls back to KIDE_AUTH_SECRET, then BETTER_AUTH_SECRET", () => {
    vi.stubEnv("KIDE_SECRET", "");
    vi.stubEnv("KIDE_AUTH_SECRET", "legacy");
    vi.stubEnv("BETTER_AUTH_SECRET", "better-auth");
    expect(resolveAuthSecret()).toBe("legacy");

    vi.stubEnv("KIDE_AUTH_SECRET", "");
    expect(resolveAuthSecret()).toBe("better-auth");
  });

  it("throws in production when none is set", () => {
    vi.stubEnv("KIDE_SECRET", "");
    vi.stubEnv("KIDE_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveAuthSecret()).toThrow(/KIDE_SECRET is not set/);
  });
});
