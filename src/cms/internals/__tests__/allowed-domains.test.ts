import { describe, expect, it } from "vitest";

import { allowedDomainsFromOrigin } from "../allowed-domains";

describe("allowedDomainsFromOrigin", () => {
  it("maps an origin to one allowed-domain pattern", () => {
    expect(allowedDomainsFromOrigin("https://cms.example.com")).toEqual([
      { protocol: "https", hostname: "cms.example.com" },
    ]);
    expect(allowedDomainsFromOrigin("http://127.0.0.1:4321/admin")).toEqual([
      { protocol: "http", hostname: "127.0.0.1", port: "4321" },
    ]);
  });

  it("returns null when unset or malformed", () => {
    expect(allowedDomainsFromOrigin(undefined)).toBeNull();
    expect(allowedDomainsFromOrigin("not a url")).toBeNull();
  });
});
