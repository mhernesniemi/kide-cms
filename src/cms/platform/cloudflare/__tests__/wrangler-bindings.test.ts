import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Ties the hand-typed CfEnv to wrangler.toml (wrangler types can't run against the template).
describe("Cloudflare binding names stay in sync with the wrangler.toml template", () => {
  it("declares exactly the bindings CfEnv and the platform code expect", () => {
    const toml = readFileSync(
      path.resolve(import.meta.dirname, "../../../../../adapters/cloudflare/wrangler.toml"),
      "utf-8",
    );
    const declared = [...toml.matchAll(/^binding\s*=\s*"([^"]+)"/gm)].map((m) => m[1]).sort();
    expect(declared).toEqual(["CMS_ASSETS", "CMS_DB"]);
  });
});
