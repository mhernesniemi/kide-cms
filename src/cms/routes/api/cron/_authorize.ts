import { readEnv } from "virtual:kide/runtime";

const timingSafeEqual = (a: string, b: string) => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
};

/**
 * Cron endpoints sit outside the admin session check, so `CRON_SECRET` is their
 * only gate. Read it through `readEnv` rather than `import.meta.env`: the latter
 * is inlined at build time, which would bake the secret into `dist/` and leave
 * the check permanently disabled for anyone setting it in the deploy environment.
 * Unset means "deny" in a production build — dev is exempt so `pnpm dev` still works.
 */
export const isAuthorized = (request: Request) => {
  const secret = readEnv("CRON_SECRET");
  if (!secret) return import.meta.env.DEV === true;

  const authHeader = request.headers.get("authorization") ?? "";
  return timingSafeEqual(authHeader, `Bearer ${secret}`);
};

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
