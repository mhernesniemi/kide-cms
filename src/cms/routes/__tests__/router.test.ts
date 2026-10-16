import { describe, expect, it } from "vitest";
import type { CmsContext } from "../context";
import { redirect } from "../context";
import { createRouter } from "../router";

const echo = (name: string) => async () => ({
  GET: (context: CmsContext) => Response.json({ name, params: context.params }),
  POST: () => new Response(`${name}:post`),
});

const router = createRouter([
  { pattern: "/api/cms/auth/login", load: echo("login") },
  { pattern: "/api/cms/auth/[...all]", load: echo("auth-all") },
  { pattern: "/api/cms/assets/[id]", load: echo("asset") },
  { pattern: "/api/cms/assets", load: echo("assets") },
  { pattern: "/api/cms/[collection]/[...path]", load: echo("collection") },
]);

const context = (path: string, method = "GET"): CmsContext => {
  const url = new URL(`http://localhost${path}`);
  return { request: new Request(url, { method }), url, params: {}, locals: {}, clientAddress: "127.0.0.1", redirect };
};

const run = async (path: string, method = "GET") => {
  const response = await router.dispatch(context(path, method));
  return response && (method === "GET" ? response.json() : response.text());
};

describe("createRouter", () => {
  it("prefers earlier, more specific patterns", async () => {
    expect(await run("/api/cms/auth/login")).toEqual({ name: "login", params: {} });
    expect(await run("/api/cms/auth/callback/github")).toEqual({
      name: "auth-all",
      params: { all: "callback/github" },
    });
  });

  it("matches params and falls through by segment count", async () => {
    expect(await run("/api/cms/assets/a%20b")).toEqual({ name: "asset", params: { id: "a b" } });
    expect(await run("/api/cms/assets")).toEqual({ name: "assets", params: {} });
  });

  it("leaves an empty rest param undefined", async () => {
    expect(await run("/api/cms/posts")).toEqual({ name: "collection", params: { collection: "posts" } });
    expect(await run("/api/cms/posts/abc/versions")).toEqual({
      name: "collection",
      params: { collection: "posts", path: "abc/versions" },
    });
  });

  it("dispatches by method, HEAD falling back to GET", async () => {
    expect(await run("/api/cms/assets", "POST")).toBe("assets:post");
    expect((await router.dispatch(context("/api/cms/assets", "HEAD")))?.status).toBe(200);
    expect((await router.dispatch(context("/api/cms/assets", "DELETE")))?.status).toBe(405);
  });

  it("returns null when nothing matches", async () => {
    expect(await router.dispatch(context("/blog/post"))).toBeNull();
  });
});
