import type { APIRoute } from "astro";

import config from "../../../../cms/collections.config";
import { cms } from "../../../../cms/.generated/api";

export const prerender = false;

const cmsRuntime = cms as Record<string, any> & { meta: typeof cms.meta };

const getSegments = (path: string | undefined) => (path ?? "").split("/").filter(Boolean);

const isFormRequest = (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
};

// Append _toast and _msg params so the layout can render a server-side toast
const redirect = (location: string, toast?: { status: "success" | "error"; msg: string }) => {
  let target = location;
  if (toast) {
    const sep = target.includes("?") ? "&" : "?";
    target += `${sep}_toast=${toast.status}&_msg=${encodeURIComponent(toast.msg)}`;
  }
  return new Response(null, { status: 303, headers: { Location: target } });
};

const stripToastParams = (url: string) => {
  const [path, query] = url.split("?");
  if (!query) return url;
  const params = new URLSearchParams(query);
  params.delete("_toast");
  params.delete("_msg");
  return params.size ? `${path}?${params}` : path;
};

const parseJsonQuery = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const getCollection = (slug: string) => {
  const collection = config.collections.find((entry) => entry.slug === slug);
  if (!collection) {
    throw new Error(`Unknown collection "${slug}".`);
  }

  return collection;
};

const extractDataFromForm = async (request: Request) => {
  const formData = await request.formData();
  const entries = [...formData.entries()];

  return {
    action: String(formData.get("_action") ?? "create"),
    intent: String(formData.get("_intent") ?? "save"),
    // Strip stale toast params from redirectTo (they persist in the hidden input
    // because the server renders the form before the client-side URL cleanup runs)
    redirectTo: stripToastParams(String(formData.get("redirectTo") ?? "/admin")),
    locale: formData.get("locale") ? String(formData.get("locale")) : undefined,
    version: formData.get("version") ? Number(formData.get("version")) : undefined,
    data: Object.fromEntries(
      entries.filter(([key]) => !key.startsWith("_") && key !== "redirectTo" && key !== "locale" && key !== "version"),
    ),
  };
};

const handleHtmlMutation = async (
  collectionSlug: string,
  documentId: string | undefined,
  request: Request,
  locals: App.Locals,
  cache?: { invalidate: (opts: { tags: string[] }) => void | Promise<void> },
) => {
  const { action, data, intent, redirectTo, locale, version } = await extractDataFromForm(request);
  const collectionApi = cmsRuntime[collectionSlug];
  const collection = getCollection(collectionSlug);
  const ctx = getRuntimeContext(locals, cache);

  const name = collection.labels.singular;

  try {
    if (action === "create") {
      const created = await collectionApi.create(data, ctx);
      if (collection.drafts && intent === "publish") {
        await collectionApi.publish(created._id, ctx);
      }
      const msg = intent === "publish" ? `${name} created and published` : `${name} created`;
      return redirect(`/admin/${collectionSlug}/${created._id}`, { status: "success", msg });
    }

    if (!documentId) {
      throw new Error("A document id is required for this action.");
    }

    if (action === "update") {
      await collectionApi.update(documentId, data, ctx);
      if (collection.drafts && intent === "publish") {
        await collectionApi.publish(documentId, ctx);
      } else if (collection.drafts && intent === "unpublish") {
        await collectionApi.unpublish(documentId, ctx);
      }
      // intent === "save" — just saves, page stays published if it was
      // Different message for draft save vs publish
      const msg =
        intent === "publish" ? `${name} published` : intent === "unpublish" ? `${name} unpublished` : `${name} saved`;
      return redirect(redirectTo, { status: "success", msg });
    }

    if (action === "delete") {
      await collectionApi.delete(documentId, ctx);
      return redirect(`/admin/${collectionSlug}`, { status: "success", msg: `${name} deleted` });
    }

    if (action === "publish") {
      await collectionApi.publish(documentId, ctx);
      return redirect(redirectTo, { status: "success", msg: `${name} published` });
    }

    if (action === "unpublish") {
      await collectionApi.unpublish(documentId, ctx);
      return redirect(redirectTo, { status: "success", msg: `${name} unpublished` });
    }

    if (action === "restore" && version) {
      await collectionApi.restore(documentId, version, ctx);
      return redirect(redirectTo, { status: "success", msg: `Version ${version} restored` });
    }

    if (action === "save-translation" && locale) {
      await collectionApi.upsertTranslation(documentId, locale, data, ctx);
      return redirect(redirectTo, { status: "success", msg: `${locale} translation saved` });
    }

    return redirect(redirectTo);
  } catch (error) {
    const msg = error instanceof Error ? error.message : `Failed to ${action}`;
    const fallback = documentId ? redirectTo : `/admin/${collectionSlug}`;
    return redirect(fallback, { status: "error", msg });
  }
};

const getRuntimeContext = (
  locals: App.Locals,
  cache?: { invalidate: (opts: { tags: string[] }) => void | Promise<void> },
) => {
  const user = locals.user;
  return {
    ...(user ? { user: { id: user.id, role: user.role, email: user.email } } : {}),
    ...(cache ? { cache } : {}),
  };
};

export const GET: APIRoute = async ({ params, url, locals }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const ctx = getRuntimeContext(locals);
  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  const locale = url.searchParams.get("locale") ?? undefined;
  const status = (url.searchParams.get("status") as "draft" | "published" | "any" | null) ?? undefined;

  if (documentId) {
    const doc = await cmsRuntime[collectionSlug].findById(documentId, { locale, status }, ctx);
    if (!doc) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }

    return Response.json(doc);
  }

  const docs = await cmsRuntime[collectionSlug].find(
    {
      where: parseJsonQuery(url.searchParams.get("where")),
      sort: parseJsonQuery(url.searchParams.get("sort")),
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
      locale,
      status,
    },
    ctx,
  );

  return Response.json(docs);
};

export const POST: APIRoute = async ({ params, request, locals, cache }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const ctx = getRuntimeContext(locals, cache);
  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  const pathAction = pathSegments[1];

  if (isFormRequest(request)) {
    return handleHtmlMutation(collectionSlug, documentId, request, locals, cache);
  }

  const collectionApi = cmsRuntime[collectionSlug];

  if (pathAction === "publish" && documentId) {
    return Response.json(await collectionApi.publish(documentId, ctx));
  }

  if (pathAction === "unpublish" && documentId) {
    return Response.json(await collectionApi.unpublish(documentId, ctx));
  }

  const body = await request.json();
  const created = await collectionApi.create(body, ctx);
  return Response.json(created, { status: 201 });
};

export const PATCH: APIRoute = async ({ params, request, locals, cache }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const ctx = getRuntimeContext(locals, cache);
  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  if (!documentId) {
    return Response.json({ error: "Document id is required." }, { status: 400 });
  }

  const body = await request.json();
  const updated = await cmsRuntime[collectionSlug].update(documentId, body, ctx);
  return Response.json(updated);
};

export const DELETE: APIRoute = async ({ params, locals, cache }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return new Response(null, { status: 400 });
  }

  const ctx = getRuntimeContext(locals, cache);
  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  if (!documentId) {
    return new Response(null, { status: 400 });
  }

  await cmsRuntime[collectionSlug].delete(documentId, ctx);
  return new Response(null, { status: 204 });
};
