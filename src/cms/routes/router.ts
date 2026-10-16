import type { CmsContext, CmsRoute } from "./context";

type RouteModule = Partial<Record<string, CmsRoute | unknown>>;

export interface RouteDefinition {
  /** Astro-style pattern: `/api/cms/assets/[id]`, `/uploads/[...path]`. */
  pattern: string;
  load: () => Promise<RouteModule>;
}

type Segment = { kind: "static"; value: string } | { kind: "param"; name: string } | { kind: "rest"; name: string };

interface CompiledRoute extends RouteDefinition {
  segments: Segment[];
}

const compile = (route: RouteDefinition): CompiledRoute => ({
  ...route,
  segments: route.pattern
    .split("/")
    .filter(Boolean)
    .map((part): Segment => {
      const rest = /^\[\.\.\.(\w+)\]$/.exec(part);
      if (rest) return { kind: "rest", name: rest[1] };
      const param = /^\[(\w+)\]$/.exec(part);
      if (param) return { kind: "param", name: param[1] };
      return { kind: "static", value: part };
    }),
});

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const matchRoute = (route: CompiledRoute, parts: string[]): Record<string, string | undefined> | null => {
  const params: Record<string, string | undefined> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i];
    if (segment.kind === "rest") {
      const rest = parts.slice(i);
      params[segment.name] = rest.length > 0 ? rest.map(decode).join("/") : undefined;
      return params;
    }
    const part = parts[i];
    if (part === undefined) return null;
    if (segment.kind === "static") {
      if (part !== segment.value) return null;
    } else {
      params[segment.name] = decode(part);
    }
  }
  return parts.length === route.segments.length ? params : null;
};

/**
 * Path segments, or null for a malformed path. Empty segments (`//admin`, `/api//cms`)
 * are refused rather than collapsed: the middleware classifies requests by the raw
 * pathname, so a router that read `//admin` as `/admin` would serve it unauthenticated.
 */
export const pathSegments = (pathname: string): string[] | null => {
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed === "/") return [];
  const parts = trimmed.slice(1).split("/");
  return parts.includes("") ? null : parts;
};

/** First match wins, so list specific patterns before the catch-alls they overlap. */
export function createRouter(definitions: RouteDefinition[]) {
  const routes = definitions.map(compile);

  const match = (pathname: string) => {
    const parts = pathSegments(pathname);
    if (!parts) return null;
    for (const route of routes) {
      const params = matchRoute(route, parts);
      if (params) return { route, params };
    }
    return null;
  };

  // Mutates `context.params` rather than spreading: host contexts expose lazy getters
  // (Astro's clientAddress throws on adapters without one) that a spread would trigger.
  const dispatch = async (context: CmsContext): Promise<Response | null> => {
    const found = match(context.url.pathname);
    if (!found) return null;
    const mod = await found.route.load();
    const method = context.request.method.toUpperCase();
    const handler = (mod[method] ?? (method === "HEAD" ? mod.GET : undefined) ?? mod.ALL) as CmsRoute | undefined;
    if (typeof handler !== "function") {
      return new Response(null, { status: 405 });
    }
    context.params = found.params;
    return handler(context);
  };

  return { match, dispatch };
}
