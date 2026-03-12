import type { APIRoute } from "astro";

import { destroySession, clearSessionCookie } from "@/cms/core/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/cms_session=([^;]+)/);

  if (match) {
    await destroySession(match[1]);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": clearSessionCookie(),
    },
  });
};
