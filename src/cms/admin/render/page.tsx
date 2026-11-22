import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import assets from "virtual:kide/admin-assets";
import type { CmsContext, CmsRoute } from "../../routes/context";
import { resetIslands } from "./island-server";

/** Admin stylesheet and browser entry; goes inside every admin page's <head>. */
export function AdminAssets() {
  return (
    <>
      <style>{"kide-island,kide-slot{display:contents}"}</style>
      {assets.styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {assets.inlineModules.map((code, index) => (
        <script key={index} type="module" dangerouslySetInnerHTML={{ __html: code }} />
      ))}
      {assets.scripts.map((src) => (
        <script key={src} type="module" src={src} />
      ))}
    </>
  );
}

export const renderPage = (element: ReactElement, init?: ResponseInit) => {
  resetIslands();
  const html = `<!doctype html>${renderToString(element)}`;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { ...init, headers });
};

/**
 * An admin page: `load` reads the request and returns props (or a Response such
 * as a redirect), `Page` renders them. Pages are server-only markup; anything
 * interactive goes through <Island>.
 */
export const definePage =
  <P extends object>(
    load: (context: CmsContext) => P | Response | Promise<P | Response>,
    Page: (props: P) => ReactElement,
  ): CmsRoute =>
  async (context) => {
    const result = await load(context);
    if (result instanceof Response) return result;
    return renderPage(<Page {...result} />);
  };

export { getCookie } from "../lib/cookies";
