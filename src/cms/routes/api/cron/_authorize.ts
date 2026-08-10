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
 * Nothing in this module may reference `import.meta.env`, not even `DEV`: Vite then emits
 * the whole env object, filling in every key named as a string literal here — so
 * `"CRON_SECRET"` would be baked into `dist/`. Read it through `readEnv` at runtime.
 */
export const isAuthorized = (request: Request) => {
  const secret = readEnv("CRON_SECRET");
  if (!secret) return process.env.NODE_ENV === "development";

  const authHeader = request.headers.get("authorization") ?? "";
  return timingSafeEqual(authHeader, `Bearer ${secret}`);
};

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
