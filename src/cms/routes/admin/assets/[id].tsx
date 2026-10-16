import { ArrowLeft } from "lucide-react";
import config from "virtual:kide/config";
import { assets, findAssetUsage, folders, isAiEnabled } from "virtual:kide/runtime";
import { AdminCard } from "../../../admin/components/AdminCard";
import DocumentActions from "../../../admin/components/DocumentActions";
import AiGenerateButton from "../../../admin/components/AiGenerateButton";
import FocalPointSelector from "../../../admin/components/FocalPointSelector";
import UnsavedGuard from "../../../admin/components/UnsavedGuard";
import TreeSelect, { flattenByParent } from "../../../admin/components/TreeSelect";
import { buttonVariants } from "../../../admin/components/ui/button";
import { Label } from "../../../admin/components/ui/label";
import { Textarea } from "../../../admin/components/ui/textarea";
import { AdminLayout, loadAdminLayout } from "../../../admin/layouts/AdminLayout";
import { Island } from "../../../admin/render/island";
import { definePage, getCookie } from "../../../admin/render/page";
import { ReverseReferencesList } from "../../../admin/views/edit/ReverseReferencesList";
import { formatDate, initDateFormat, DEFAULT_PRESETS } from "../../../core";
import type { CmsContext } from "../../context";

const load = async (context: CmsContext) => {
  const user = context.locals.user;
  const accessibleCollections = config.collections.filter((c) => {
    const rule = c.access?.read;
    if (!rule) return true;
    return rule({ user: user ?? null, doc: null, operation: "read", collection: c.slug });
  });

  initDateFormat(config, getCookie(context.request, "tz"));
  const { id } = context.params;
  if (!id) return context.redirect("/admin/assets");

  const asset = await assets.findById(id);
  if (!asset) return context.redirect("/admin/assets");

  const isEmbed = context.url.searchParams.get("_embed") === "1";
  const aiEnabled = isAiEnabled();
  const isImage = asset.mimeType.startsWith("image/");

  // Distinct aspect ratios across configured + built-in presets, for the crop preview.
  const mergedPresets = { ...DEFAULT_PRESETS, ...(config.images?.presets ?? {}) };
  const cropPresets: Array<{ name: string; aspect: string }> = [];
  const seenAspects = new Set<string>();
  for (const [name, preset] of Object.entries(mergedPresets)) {
    if (!preset.aspect || seenAspects.has(preset.aspect)) continue;
    seenAspects.add(preset.aspect);
    cropPresets.push({ name, aspect: preset.aspect });
  }
  const { refs: usage, incomplete: usageIncomplete } = await findAssetUsage(config, asset.storagePath);
  const usageCount = usage.reduce((sum, ref) => sum + ref.docs.length, 0);

  const currentFolder = asset.folder ? await folders.findById(asset.folder) : null;
  const allFolders = await folders.findAll();

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const folderItems = flattenByParent(
    allFolders,
    (f) => f._id,
    (f) => f.name,
    (f) => f.parent,
  );

  const layout = await loadAdminLayout(context);
  return {
    layout,
    accessibleCollections,
    asset,
    isEmbed,
    aiEnabled,
    isImage,
    cropPresets,
    usage,
    usageIncomplete,
    usageCount,
    currentFolder,
    formatSize,
    folderItems,
  };
};

type Props = Exclude<Awaited<ReturnType<typeof load>>, Response>;

function AssetPage({
  layout,
  accessibleCollections,
  asset,
  isEmbed,
  aiEnabled,
  isImage,
  cropPresets,
  usage,
  usageIncomplete,
  usageCount,
  currentFolder,
  formatSize,
  folderItems,
}: Props) {
  return (
    <AdminLayout
      layout={layout}
      title={`${asset.filename} | Assets | Kide CMS`}
      collections={accessibleCollections}
      activeCollection="assets"
      customNav={config.admin?.nav}
      embed={isEmbed}
    >
      <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            {!isEmbed && (
              <a
                href={asset.folder ? `/admin/assets?folder=${asset.folder}` : "/admin/assets"}
                className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                {currentFolder ? currentFolder.name : "Assets"}
              </a>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{asset.filename}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="submit"
            form="asset-form"
            value="save"
            disabled
            className={buttonVariants({ variant: "outline" })}
          >
            Save
          </button>
          <Island
            name="DocumentActions"
            component={DocumentActions}
            props={{
              formId: "asset-form",
              showDelete: true,
              entityLabel: "asset",
              referencesEndpoint: `/api/cms/asset-usage?id=${asset._id}`,
              forceOnConfirm: true,
            }}
          />
        </div>

        <Island
          name="UnsavedGuard"
          component={UnsavedGuard}
          props={{ formId: "asset-form", isNew: false, isDraft: false }}
        />
        <form id="asset-form" method="post" action={`/api/cms/assets/${asset._id}`}>
          <input type="hidden" name="_action" value="update" />
          {isEmbed && <input type="hidden" name="_embed" value="1" />}
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,460px)]">
            <div className="space-y-6">
              {isImage && (
                <AdminCard title="Preview">
                  <Island
                    name="FocalPointSelector"
                    component={FocalPointSelector}
                    props={{
                      src: asset.url,
                      alt: asset.alt ?? asset.filename,
                      focalX: asset.focalX,
                      focalY: asset.focalY,
                      presets: cropPresets,
                    }}
                  />
                </AdminCard>
              )}
            </div>

            <div className="space-y-6 text-sm [&_input]:text-sm [&_textarea]:text-sm">
              <AdminCard title="Details">
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="folder">Folder</Label>
                    <Island
                      name="TreeSelect"
                      component={TreeSelect}
                      props={{
                        name: "folder",
                        value: asset.folder ?? "",
                        placeholder: "Select folder...",
                        searchPlaceholder: "Search folders...",
                        emptyMessage: "No folders found.",
                        items: folderItems,
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="alt">Alt text</Label>
                    <Textarea
                      className="w-full shadow-none"
                      id="alt"
                      name="alt"
                      rows={3}
                      defaultValue={asset.alt ?? ""}
                      placeholder="Describe the image for accessibility..."
                    />
                    {aiEnabled && isImage && (
                      <Island
                        name="AiGenerateButton"
                        component={AiGenerateButton}
                        props={{
                          endpoint: "/api/cms/ai/alt-text",
                          payload: { imageUrl: asset.url, filename: asset.filename },
                          targetField: "alt",
                          label: "Generate alt text",
                        }}
                      />
                    )}
                  </div>
                </div>
              </AdminCard>

              <AdminCard title="Info">
                <dl className="grid gap-3">
                  <div>
                    <dt className="text-muted-foreground text-xs">Filename</dt>
                    <dd className="mt-0.5">{asset.filename}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Type</dt>
                    <dd className="mt-0.5">{asset.mimeType}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Size</dt>
                    <dd className="mt-0.5">{formatSize(asset.size)}</dd>
                  </div>
                  {asset.width && asset.height && (
                    <div>
                      <dt className="text-muted-foreground text-xs">Dimensions</dt>
                      <dd className="mt-0.5">
                        {asset.width} &times; {asset.height} px
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground text-xs">Path</dt>
                    <dd className="mt-0.5 font-mono text-xs break-all">{asset.storagePath}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Created</dt>
                    <dd className="mt-0.5">{formatDate(asset._createdAt)}</dd>
                  </div>
                </dl>
              </AdminCard>

              {usageCount > 0 ? (
                <ReverseReferencesList reverseRefs={usage} variant="record" title="Used in" />
              ) : (
                <AdminCard title="Used in">
                  <p className="text-muted-foreground text-sm">
                    {usageIncomplete.length > 0
                      ? `Could not check ${usageIncomplete.join(", ")} — usage is unknown.`
                      : "Not used by any document."}
                  </p>
                </AdminCard>
              )}
            </div>
          </div>
        </form>
      </section>
    </AdminLayout>
  );
}

export const GET = definePage(load, AssetPage);
