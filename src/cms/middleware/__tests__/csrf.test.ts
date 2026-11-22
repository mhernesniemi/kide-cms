import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "../csrf";

const site = "https://cms.example.com";
const check = (headers: Record<string, string>) => isSameOriginRequest(new Headers(headers), site);

describe("isSameOriginRequest", () => {
  it("trusts the browser's same-origin Fetch Metadata even when the server sees localhost", () => {
    expect(isSameOriginRequest(new Headers({ "sec-fetch-site": "same-origin" }), "http://localhost:4321")).toBe(true);
  });

  it("rejects cross-site and same-site Fetch Metadata regardless of Origin", () => {
    expect(check({ "sec-fetch-site": "cross-site", origin: site })).toBe(false);
    expect(check({ "sec-fetch-site": "same-site", origin: site })).toBe(false);
  });

  it("falls back to Origin, then Referer, without Fetch Metadata", () => {
    expect(check({ origin: site })).toBe(true);
    expect(check({ origin: "https://evil.test" })).toBe(false);
    expect(check({ referer: `${site}/admin/pages` })).toBe(true);
    expect(check({ referer: "https://evil.test/x" })).toBe(false);
    expect(check({ "sec-fetch-site": "none", origin: site })).toBe(true);
  });

  it("rejects a request with no same-origin signal", () => {
    expect(check({})).toBe(false);
    expect(check({ referer: "not a url" })).toBe(false);
  });
});
