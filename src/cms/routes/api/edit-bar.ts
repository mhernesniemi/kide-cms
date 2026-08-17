import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { canRead, getVisualStatus } from "../../admin/lib/access";

export const prerender = false;

const cmsRuntime = cms as Record<string, any>;

// Resolves a public page's `data-cms-doc="<collection>:<id>"` marker into an admin
// edit URL for the edit-bar chip. Auth is enforced by the middleware (401 without a
// session); this only decides whether THIS user may see a link to THIS document.
export const GET: APIRoute = async ({ url, locals }) => {
  if (config.admin?.editBar === false) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const ref = url.searchParams.get("doc") ?? "";
  const separator = ref.indexOf(":");
  const collectionSlug = separator === -1 ? ref : ref.slice(0, separator);
  const documentId = separator === -1 ? "" : ref.slice(separator + 1);

  const collection = config.collections.find((c) => c.slug === collectionSlug);
  const user = locals.user;
  if (!collection || collection.auth || !documentId || !user || !canRead(config, user, collectionSlug)) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  let doc: Record<string, unknown> | null;
  try {
    doc = await cmsRuntime[collectionSlug].findById(documentId, { status: "any" }, { user });
  } catch {
    doc = null;
  }
  if (!doc) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(
    {
      editUrl: collection.singleton ? `/admin/${collectionSlug}` : `/admin/${collectionSlug}/${documentId}`,
      status: collection.drafts ? getVisualStatus(doc) : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
