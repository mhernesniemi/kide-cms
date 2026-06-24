/**
 * Resolves the Cloudflare bindings (CMS_DB, CMS_ASSETS, …) in both runtimes the
 * CMS runs in:
 *
 *   - Worker  (`astro dev`, and the deployed Worker): bindings come from the
 *     `cloudflare:workers` module.
 *   - Plain Node (`cms:seed`, `cms:admin`, `cms:reindex`, and your own import /
 *     migration scripts run with `node --import tsx`): that module doesn't
 *     exist, so we fall back to wrangler's getPlatformProxy(), which exposes the
 *     SAME local D1/R2 that `astro dev` uses (from .wrangler/state).
 *
 * This is what lets the cms:* scripts (and custom scripts) talk to the local
 * database/storage from Node without being run inside the Worker.
 */

type CfEnv = Record<string, any>;

type CfProxy = { env: CfEnv; dispose: () => Promise<void> };

let envPromise: Promise<CfEnv> | undefined;
let proxy: CfProxy | null = null;

const isWorker = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

export function getCfEnv(): Promise<CfEnv> {
  envPromise ??= (async () => {
    if (isWorker()) {
      return (await import("cloudflare:workers")).env as CfEnv;
    }
    // Node: connect to the local miniflare state via wrangler. The specifier is
    // kept off the static graph (variable + @vite-ignore) so wrangler is never
    // pulled into the Worker bundle — this branch only runs in Node.
    const wranglerSpecifier = "wrangler";
    const { getPlatformProxy } = await import(/* @vite-ignore */ wranglerSpecifier);
    proxy = (await getPlatformProxy()) as CfProxy;
    return proxy.env;
  })();
  return envPromise;
}

/**
 * Tear down the local platform proxy (Node only) so a one-shot script can exit.
 * No-op inside the Worker. Safe to call multiple times. Flushes pending
 * background writes (audit/search) first so they don't hit a disposed proxy.
 */
export async function disposeCfEnv(): Promise<void> {
  const p = proxy;
  proxy = null;
  envPromise = undefined;
  if (!p) return;
  try {
    const { flushTasks } = await import("@/cms/core");
    await flushTasks();
  } catch {
    // core not loaded / nothing to flush
  }
  await p.dispose();
}
