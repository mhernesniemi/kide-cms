import type { APIRoute } from "astro";
import type { CmsContext } from "./context";
import { redirect } from "./context";
import { dispatchCmsRoute } from "./handler";

export const prerender = false;

export const ALL: APIRoute = async (astro) => {
  const context: CmsContext = {
    request: astro.request,
    url: astro.url,
    params: {},
    locals: astro.locals,
    get clientAddress() {
      return astro.clientAddress;
    },
    cache: astro.cache,
    redirect,
  };
  return (await dispatchCmsRoute(context)) ?? new Response("Not found", { status: 404 });
};
