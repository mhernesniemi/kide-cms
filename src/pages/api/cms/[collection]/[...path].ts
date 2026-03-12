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

const redirect = (location: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: location,
    },
  });

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
    redirectTo: String(formData.get("redirectTo") ?? "/admin"),
    locale: formData.get("locale") ? String(formData.get("locale")) : undefined,
    version: formData.get("version") ? Number(formData.get("version")) : undefined,
    data: Object.fromEntries(entries.filter(([key]) => !key.startsWith("_") && key !== "redirectTo" && key !== "locale" && key !== "version")),
  };
};

const handleHtmlMutation = async (collectionSlug: string, documentId: string | undefined, request: Request) => {
  const { action, data, intent, redirectTo, locale, version } = await extractDataFromForm(request);
  const collectionApi = cmsRuntime[collectionSlug];
  const collection = getCollection(collectionSlug);

  if (action === "create") {
    const created = await collectionApi.create(data);
    if (collection.drafts && intent === "publish") {
      await collectionApi.publish(created._id);
    }
    return redirect(`/admin/${collectionSlug}/${created._id}`);
  }

  if (!documentId) {
    throw new Error("A document id is required for this action.");
  }

  if (action === "update") {
    await collectionApi.update(documentId, data);
    if (collection.drafts && intent === "publish") {
      await collectionApi.publish(documentId);
    }
    if (collection.drafts && intent === "unpublish") {
      await collectionApi.unpublish(documentId);
    }
    return redirect(redirectTo);
  }

  if (action === "delete") {
    await collectionApi.delete(documentId);
    return redirect(`/admin/${collectionSlug}`);
  }

  if (action === "publish") {
    await collectionApi.publish(documentId);
    return redirect(redirectTo);
  }

  if (action === "unpublish") {
    await collectionApi.unpublish(documentId);
    return redirect(redirectTo);
  }

  if (action === "restore" && version) {
    await collectionApi.restore(documentId, version);
    return redirect(redirectTo);
  }

  if (action === "save-translation" && locale) {
    await collectionApi.upsertTranslation(documentId, locale, data);
    return redirect(redirectTo);
  }

  return redirect(redirectTo);
};

export const GET: APIRoute = async ({ params, url }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  const locale = url.searchParams.get("locale") ?? undefined;
  const status = (url.searchParams.get("status") as "draft" | "published" | "any" | null) ?? undefined;

  if (documentId) {
    const doc = await cmsRuntime[collectionSlug].findById(documentId, { locale, status });
    if (!doc) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }

    return Response.json(doc);
  }

  const docs = await cmsRuntime[collectionSlug].find({
    where: parseJsonQuery(url.searchParams.get("where")),
    sort: parseJsonQuery(url.searchParams.get("sort")),
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    locale,
    status,
  });

  return Response.json(docs);
};

export const POST: APIRoute = async ({ params, request }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  const pathAction = pathSegments[1];

  if (isFormRequest(request)) {
    return handleHtmlMutation(collectionSlug, documentId, request);
  }

  const body = await request.json();
  const collectionApi = cmsRuntime[collectionSlug];

  if (pathAction === "publish" && documentId) {
    return Response.json(await collectionApi.publish(documentId));
  }

  if (pathAction === "unpublish" && documentId) {
    return Response.json(await collectionApi.unpublish(documentId));
  }

  const created = await collectionApi.create(body);
  return Response.json(created, { status: 201 });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return Response.json({ error: "Collection is required." }, { status: 400 });
  }

  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  if (!documentId) {
    return Response.json({ error: "Document id is required." }, { status: 400 });
  }

  const body = await request.json();
  const updated = await cmsRuntime[collectionSlug].update(documentId, body);
  return Response.json(updated);
};

export const DELETE: APIRoute = async ({ params }) => {
  const collectionSlug = params.collection;
  if (!collectionSlug) {
    return new Response(null, { status: 400 });
  }

  const pathSegments = getSegments(params.path);
  const documentId = pathSegments[0];
  if (!documentId) {
    return new Response(null, { status: 400 });
  }

  await cmsRuntime[collectionSlug].delete(documentId);
  return new Response(null, { status: 204 });
};
