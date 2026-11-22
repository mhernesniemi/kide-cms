import { assets, folders } from "virtual:kide/runtime";
import type { CmsContext } from "../../routes/context";

export const ASSET_PAGE_SIZE = 24;

export async function loadAssetsView(context: CmsContext) {
  const folderParam = context.url.searchParams.get("folder");
  // Three sidebar scopes:
  //   absent    → "all"     → every asset across all folders (unscoped)
  //   "unfiled" → "unfiled" → assets not in any folder (folder IS NULL)
  //   "<id>"    → that folder
  const scope = !folderParam ? "all" : folderParam === "unfiled" ? "unfiled" : folderParam;
  // Map the scope to the core `folder` filter: undefined = unscoped, null = IS NULL, id = that folder.
  const folderScope = scope === "all" ? undefined : scope === "unfiled" ? null : scope;

  const search = (context.url.searchParams.get("q") ?? "").trim();
  const requestedPage = Math.max(1, Number(context.url.searchParams.get("page") ?? "1"));

  const currentFolder = typeof folderScope === "string" ? await folders.findById(folderScope) : null;
  if (typeof folderScope === "string" && !currentFolder) return context.redirect("/admin/assets");

  // Every folder — the sticky sidebar renders the whole tree as drop targets.
  const allFolders = await folders.findAll();

  const total = await assets.count({ folder: folderScope, search });
  const totalPages = Math.max(1, Math.ceil(total / ASSET_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const folderAssets = await assets.find({
    folder: folderScope,
    search,
    limit: ASSET_PAGE_SIZE,
    offset: (page - 1) * ASSET_PAGE_SIZE,
  });

  const breadcrumbs: Array<{ label: string; href: string; id: string }> = [];
  for (let folder = currentFolder; folder; folder = folder.parent ? await folders.findById(folder.parent) : null) {
    breadcrumbs.unshift({ label: folder.name, href: `/admin/assets?folder=${folder._id}`, id: folder._id });
  }

  return {
    folders: allFolders.map((f) => ({ _id: f._id, name: f.name, parent: f.parent ?? null })),
    assets: folderAssets.map((a) => ({
      _id: a._id,
      filename: a.filename,
      mimeType: a.mimeType,
      url: a.url,
      alt: a.alt,
      focalX: a.focalX,
      focalY: a.focalY,
      _createdAt: a._createdAt,
    })),
    breadcrumbs,
    scope,
    search,
    page,
    totalPages,
    total,
    pageSize: ASSET_PAGE_SIZE,
  };
}
