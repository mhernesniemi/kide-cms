import { ArrowLeft } from "lucide-react";
import { AdminCard } from "../components/AdminCard";
import AiGenerateButton from "../components/AiGenerateButton";
import DocumentActions from "../components/DocumentActions";
import FocalPointSelector from "../components/FocalPointSelector";
import TreeSelect from "../components/TreeSelect";
import UnsavedGuard from "../components/UnsavedGuard";
import { buttonVariants } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Island } from "../render/island";
import { ReverseReferencesList } from "./edit/ReverseReferencesList";
import type { loadAssetView } from "./AssetView.load";

export type AssetViewData = Exclude<Awaited<ReturnType<typeof loadAssetView>>, Response>;

export function AssetView({
  asset,
  size,
  created,
  isEmbed,
  aiEnabled,
  isImage,
  cropPresets,
  usage,
  usageIncomplete,
  usageCount,
  currentFolderName,
  folderItems,
}: AssetViewData) {
  return (
    <>
      <section className="space-y-6 px-4 py-6 lg:py-8 lg:pr-8 lg:pl-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            {!isEmbed && (
              <a
                href={asset.folder ? `/admin/assets?folder=${asset.folder}` : "/admin/assets"}
                className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                {currentFolderName ?? "Assets"}
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
        <form id="asset-form" method="post" action={`/api/cms/assets/${asset._id}`} data-kide-submit>
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
                    <dd className="mt-0.5">{size}</dd>
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
                    <dd className="mt-0.5">{created}</dd>
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
    </>
  );
}
