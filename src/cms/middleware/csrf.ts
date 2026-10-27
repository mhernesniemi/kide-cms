// Same-origin proof for a state-changing request. Fetch Metadata comes first: browsers set
// Sec-Fetch-Site themselves, and it doesn't depend on the server knowing its public origin
// (behind a proxy without CMS_TRUSTED_ORIGIN, request.url is localhost). Origin/Referer is
// the fallback for clients that don't send it.
export const isSameOriginRequest = (headers: Headers, expectedOrigin: string): boolean => {
  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;
  if (secFetchSite && secFetchSite !== "none") return false;

  const origin = headers.get("origin");
  if (origin) return origin === expectedOrigin;
  const referer = headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
};
