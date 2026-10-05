import type { APIRoute } from "astro";

import { hitRateLimit } from "virtual:kide/runtime";
import { getAdminAuth, resolveAdminAuth, MIN_PASSWORD_LENGTH } from "../../../core";
import config from "virtual:kide/config";
import { authResponse } from "./_better-auth";

export const prerender = false;

const redirectWithError = (token: string, error: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: `/admin/reset-password?token=${encodeURIComponent(token)}&error=${error}` },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const auth = resolveAdminAuth(config);
  if (!auth.password.forgotPassword) return Response.json({ error: "Not found" }, { status: 404 });

  const ipLimit = await hitRateLimit("reset:ip", clientAddress, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.ok) return redirectWithError("", "invalid");

  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token || !password) return redirectWithError(token, "missing");
  if (password !== confirmPassword) return redirectWithError(token, "password");
  if (password.length < MIN_PASSWORD_LENGTH) return redirectWithError(token, "short");

  // Better Auth consumes the (hashed-at-rest, single-use) token atomically, writes the
  // credential and revokes every session the user had.
  const betterAuth = await getAdminAuth(request);
  const response = await authResponse(() =>
    betterAuth.api.resetPassword({
      body: { newPassword: password, token },
      headers: request.headers,
      asResponse: true,
    }),
  );
  if (!response.ok) return redirectWithError(token, "invalid");

  // Sign in again rather than straight in: a second factor, if enrolled, still applies.
  return new Response(null, { status: 303, headers: { Location: "/admin/login?status=password-reset" } });
};
