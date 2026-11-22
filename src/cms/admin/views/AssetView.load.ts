import config from "virtual:kide/config";
import { assets, findAssetUsage, folders, isAiEnabled } from "virtual:kide/runtime";
import { flattenByParent } from "../components/TreeSelect";
import { getCookie } from "../lib/cookies";
import { formatDate, initDateFormat, DEFAULT_PRESETS } from "../../core";
import type { CmsContext } from "../../routes/context";

export async function loadAssetView(context: CmsContext) {
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

  return {
    asset: {
      _id: asset._id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      url: asset.url,
      alt: asset.alt,
      focalX: asset.focalX,
      focalY: asset.focalY,
      folder: asset.folder ?? null,
      width: asset.width,
      height: asset.height,
      storagePath: asset.storagePath,
    },
    size: formatSize(asset.size),
    created: formatDate(asset._createdAt),
    isEmbed,
    aiEnabled,
    isImage,
    cropPresets,
    usage,
    usageIncomplete,
    usageCount,
    currentFolderName: currentFolder?.name ?? null,
    folderItems,
  };
}
