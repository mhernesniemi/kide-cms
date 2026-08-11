// Runtime module provided by the Workers runtime (nodejs_compat). Declared here so the
// Cloudflare profile type-checks under tsconfig.cloudflare.json without the full runtime.
declare module "cloudflare:workers" {
  export const env: import("./cf-env").CfEnv;
}
