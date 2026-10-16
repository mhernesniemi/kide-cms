// Node types for the core modules this profile reaches through cf-env (nodejs_compat
// provides them at runtime); referenced here, not in tsconfig.cloudflare.json, which
// client projects own and upgrades never touch.
/// <reference types="node" />

// Runtime module provided by the Workers runtime (nodejs_compat). Declared here so the
// Cloudflare profile type-checks under tsconfig.cloudflare.json without the full runtime.
declare module "cloudflare:workers" {
  export const env: import("./cf-env").CfEnv;
}
