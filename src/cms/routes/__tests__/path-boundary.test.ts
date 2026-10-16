import { describe, expect, it } from "vitest";
import { isGuardedPath } from "../../middleware/paths";
import { createRouter, pathSegments } from "../router";
import { cmsRoutes } from "../table";

const router = createRouter(cmsRoutes);
const PUBLIC_PATTERNS = new Set(["/uploads/[...path]", "/api/cms/img/[...path]"]);

const paths = [
  "/admin",
  "/admin/",
  "/admin/recent",
  "/admin/posts/abc",
  "/api/cms/assets",
  "/api/cms/assets/upload",
  "/api/cms/posts/abc",
  "/api/cms/img/a.jpg",
  "/uploads/a.jpg",
  // Malformed variants of guarded paths: must never reach a guarded route unguarded.
  "//admin/recent",
  "/admin//recent",
  "///admin",
  "/api//cms/assets",
  "//api/cms/assets",
  "/api/cms//assets",
  "/api//cms/assets/upload",
  "/API/cms/assets",
  "/api/%63ms/assets",
  "/x/../admin/recent",
];

describe("middleware and router agree on Kide's paths", () => {
  it.each(paths)("%s is guarded whenever it reaches a guarded route", (path) => {
    const pathname = new URL(path, "http://localhost").pathname;
    const found = router.match(pathname);
    if (found && !PUBLIC_PATTERNS.has(found.route.pattern)) {
      expect(isGuardedPath(pathname)).toBe(true);
    }
  });

  it("refuses paths with empty segments", () => {
    expect(router.match("//admin/recent")).toBeNull();
    expect(router.match("/api//cms/assets")).toBeNull();
    expect(router.match("/admin//recent")).toBeNull();
  });

  it("still serves normal paths and a trailing slash", () => {
    expect(router.match("/admin/recent")?.route.pattern).toBe("/admin/[...path]");
    expect(router.match("/api/cms/assets/")?.route.pattern).toBe("/api/cms/assets");
    expect(pathSegments("/")).toEqual([]);
  });
});
