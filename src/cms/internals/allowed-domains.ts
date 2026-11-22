// @astrojs/node only trusts the Host / X-Forwarded-* headers for domains in `security.allowedDomains`;
// otherwise Astro.url falls back to localhost. Derive the entry from Kide's own public-origin setting.
export const allowedDomainsFromOrigin = (origin: string | undefined) => {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return [
      { protocol: url.protocol.replace(/:$/, ""), hostname: url.hostname, ...(url.port ? { port: url.port } : {}) },
    ];
  } catch {
    return null;
  }
};
