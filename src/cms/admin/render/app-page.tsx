import { renderToString } from "react-dom/server";
import type { CmsContext, CmsRoute } from "../../routes/context";
import { AdminApp, NAV_HEADER, type AppPayload, type ResolveView } from "../app/AdminApp";
import { AdminDocument } from "../layouts/AdminLayout";
import { renderPage } from "./page";

/**
 * A page of the admin app: `load` returns the page's data (or a Response, e.g. a redirect).
 * Navigation inside the app asks for it as JSON; a fresh visit gets a document with the app
 * server-rendered and the same data embedded for hydration.
 */
export const defineAppPage =
  (load: (context: CmsContext) => Promise<AppPayload | Response>, resolveView: ResolveView): CmsRoute =>
  async (context) => {
    const result = await load(context);
    if (result instanceof Response) return result;
    // Through JSON on both paths, so the server renders exactly what the browser hydrates.
    const json = JSON.stringify(result);
    const headers = { "Cache-Control": "no-store", Vary: NAV_HEADER };
    if (context.request.headers.get(NAV_HEADER) === "1") {
      return new Response(json, { headers: { ...headers, "Content-Type": "application/json" } });
    }
    const payload = JSON.parse(json) as AppPayload;
    // Its own root, like the browser's hydrateRoot on #kide-app, so useId values line up.
    const appHtml = renderToString(<AdminApp initial={payload} resolveView={resolveView} />);
    return renderPage(
      <AdminDocument title={payload.title}>
        <div id="kide-app" dangerouslySetInnerHTML={{ __html: appHtml }} />
        <script
          type="application/json"
          id="kide-app-data"
          dangerouslySetInnerHTML={{ __html: json.replace(/</g, "\\u003c") }}
        />
      </AdminDocument>,
      { headers },
    );
  };
