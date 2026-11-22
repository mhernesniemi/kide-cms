import { beforeEach, describe, expect, it, vi } from "vitest";

let all: () => unknown;

vi.mock("../../../core/runtime", () => ({
  getDb: async () => ({ all: async () => all() }),
}));
vi.mock("../../../core/log", () => ({ log: { error: () => {} } }));

const { GET } = await import("../health");

describe("GET /api/cms/health", () => {
  beforeEach(() => {
    all = () => [];
  });

  it("returns 200 when the database answers", async () => {
    const response = await GET({} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 without leaking the error", async () => {
    all = () => {
      throw new Error("no such table: cms_users");
    };
    const response = await GET({} as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
