import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Ties the hand-typed CfEnv to wrangler.toml (wrangler types can't run against the template).
// In this repo that's the adapters/ overlay; a scaffolded project has it at the root, or not at
// all on the Node target.
const root = path.resolve(import.meta.dirname, "../../../../..");
const wranglerToml = [path.join(root, "adapters/cloudflare/wrangler.toml"), path.join(root, "wrangler.toml")].find(
  existsSync,
);

describe("Cloudflare binding names stay in sync with the wrangler.toml template", () => {
  it.skipIf(!wranglerToml)("declares exactly the bindings CfEnv and the platform code expect", () => {
    const toml = readFileSync(wranglerToml!, "utf-8");
    const declared = [...toml.matchAll(/^binding\s*=\s*"([^"]+)"/gm)].map((m) => m[1]).sort();
    expect(declared).toEqual(["CMS_ASSETS", "CMS_DB"]);
  });
});
