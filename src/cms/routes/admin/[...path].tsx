import config from "virtual:kide/config";
import { cms } from "virtual:kide/api";
import { AdminLayout, loadAdminLayout, type AdminLayoutData } from "../../admin/layouts/AdminLayout";
import { getCookie, definePage } from "../../admin/render/page";
import { AccessDeniedView } from "../../admin/views/AccessDeniedView";
import { EditView, loadEditView, type EditViewData } from "../../admin/views/EditView";
import { ListView, loadListView } from "../../admin/views/ListView";
import { NeedsYouView, loadNeedsYouView } from "../../admin/views/NeedsYouView";
import { RecentView, loadRecentView } from "../../admin/views/RecentView";
import { SinglesView, loadSinglesView } from "../../admin/views/SinglesView";
import { canRead } from "../../admin/lib/access";
import { getWorkingLocale } from "../../admin/lib/locale";
import { initDateFormat, resolveAdminRoute } from "../../core";
import type { CmsContext } from "../context";

type View =
  | { kind: "recent"; data: Awaited<ReturnType<typeof loadRecentView>> }
  | { kind: "needs-you"; data: Awaited<ReturnType<typeof loadNeedsYouView>> }
  | { kind: "singles"; data: Awaited<ReturnType<typeof loadSinglesView>> }
  | { kind: "denied" }
  | { kind: "list"; data: Awaited<ReturnType<typeof loadListView>> }
  | { kind: "edit"; data: EditViewData }
  | { kind: "none" };

type Props = {
  layout: AdminLayoutData;
  title: string;
  collections: typeof config.collections;
  activeCollection: string;
  embed: boolean;
  view: View;
};

const load = async (context: CmsContext): Promise<Props | Response> => {
  const { url, locals, params, redirect } = context;
  initDateFormat(config, getCookie(context.request, "tz"));

  const route = resolveAdminRoute(params.path);
  const user = locals.user;
  const runtimeContext = user ? { user } : {};
  const isEmbed = url.searchParams.get("_embed") === "1";
  const accessibleCollections = config.collections.filter((c) => canRead(config, user, c.slug));

  // /admin → /admin/recent
  if (route.kind === "dashboard") return redirect("/admin/recent");

  const collectionSlug = "collectionSlug" in route ? route.collectionSlug : null;
  const collection = collectionSlug ? (cms.meta.getCollection(collectionSlug) as any) : null;
  const canAccessCurrent =
    route.kind === "recent" ||
    route.kind === "needs-you" ||
    route.kind === "singles" ||
    !collectionSlug ||
    canRead(config, user, collectionSlug);

  // Singletons: redirect list/new to the single document's edit page
  if (collection?.singleton && canAccessCurrent && (route.kind === "list" || route.kind === "new")) {
    const cmsRuntime = cms as Record<string, any>;
    const collectionApi = cmsRuntime[collection.slug];
    const singleDocs = await collectionApi.find({ status: "any", limit: 1 }, runtimeContext);
    const singletonId = (singleDocs[0] ?? (await collectionApi.create({}, runtimeContext)))._id;
    return redirect(`/admin/${collection.slug}/${singletonId}`);
  }

  const title =
    route.kind === "recent"
      ? "Recent | Kide CMS"
      : route.kind === "needs-you"
        ? "Needs you | Kide CMS"
        : route.kind === "singles"
          ? "Singles | Kide CMS"
          : `${collection?.labels?.plural ?? "Admin"} | Kide CMS`;

  const activeCollection =
    route.kind === "recent" ? "recent" : route.kind === "needs-you" ? "needs-you" : (collectionSlug ?? "singles");

  const workingLocale = getWorkingLocale(context.request, config.locales?.supported ?? []);
  const layout = await loadAdminLayout(context);
  let view: View = { kind: "none" };
  if (route.kind === "recent") view = { kind: "recent", data: await loadRecentView(user, workingLocale) };
  else if (route.kind === "needs-you") view = { kind: "needs-you", data: await loadNeedsYouView(user, workingLocale) };
  else if (route.kind === "singles") view = { kind: "singles", data: await loadSinglesView(user, workingLocale) };
  else if (!canAccessCurrent) view = { kind: "denied" };
  else if (route.kind === "list" && collection)
    view = { kind: "list", data: await loadListView(url, user, collection, workingLocale) };
  else if ((route.kind === "new" || route.kind === "edit") && collection) {
    const data = await loadEditView(url, user, redirect, workingLocale, {
      collection,
      mode: route.kind,
      documentId: route.kind === "edit" ? route.documentId : undefined,
      variant: collection.slug === "users" || collection.slug === "form-submissions" ? "record" : "editorial",
    });
    if (data instanceof Response) return data;
    view = { kind: "edit", data };
  }

  return { layout, title, collections: accessibleCollections, activeCollection, embed: isEmbed, view };
};

function AdminPage({ layout, title, collections, activeCollection, embed, view }: Props) {
  return (
    <AdminLayout
      layout={layout}
      title={title}
      collections={collections}
      activeCollection={activeCollection}
      embed={embed}
      customNav={config.admin?.nav}
    >
      {view.kind === "recent" && <RecentView {...view.data} />}
      {view.kind === "needs-you" && <NeedsYouView {...view.data} />}
      {view.kind === "singles" && <SinglesView {...view.data} />}
      {view.kind === "denied" && <AccessDeniedView />}
      {view.kind === "list" && <ListView {...view.data} />}
      {view.kind === "edit" && <EditView {...view.data} />}
    </AdminLayout>
  );
}

export const GET = definePage(load, AdminPage);
