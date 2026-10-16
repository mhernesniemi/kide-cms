// Every Kide route and host hook imports this module, so these ambient declarations
// (virtual:kide/* modules, the <kide-island> element) reach the project's type check in
// package mode too, where the runtime isn't under the project's own include paths.
// Script declaration files (no exports), so an import can't stand in for these.
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../internals/virtual.d.ts" />
/// <reference path="../admin/render/jsx.d.ts" />
/* eslint-enable @typescript-eslint/triple-slash-reference */

export interface CmsCache {
  set: (options: false) => void;
  invalidate: (options: { tags: string[] }) => void | Promise<void>;
}

// Structurally SessionUser — importing it from core would pull Node-only modules into the
// Cloudflare type profile, which checks the uploads route and therefore this file.
export interface CmsLocals {
  user?: { id: string; email: string; name: string; role: string; [key: string]: unknown } | null;
  cfContext?: { waitUntil?: (promise: Promise<unknown>) => void };
}

/**
 * What a Kide route or page receives. Hosts build it from their own request
 * object — Astro's APIContext already satisfies it as-is.
 */
export interface CmsContext {
  request: Request;
  url: URL;
  params: Record<string, string | undefined>;
  locals: CmsLocals;
  /** Trusted client IP (the rate-limit key), as the host's adapter reports it. */
  clientAddress: string;
  cache?: CmsCache;
  redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response;
}

export type CmsRoute = (context: CmsContext) => Response | Promise<Response>;

export const redirect = (path: string, status: 301 | 302 | 303 | 307 | 308 = 302) =>
  new Response(null, { status, headers: { Location: path } });
