import type { APIRoute } from "astro";
import config from "virtual:kide/config";
import { assets, countAssetUsage, findAssetUsage } from "virtual:kide/runtime";

export const prerender = false;

/**
 * Where assets are used. Deliberately not under /api/cms/assets/… — a static
 * segment there is shadowed by the [id] route whenever it is not registered,
 * which turns a missing route into a plausible-looking "Not found" for an asset.
 *
 * `?id=<assetId>`     → { usage, total, incomplete }  — the detail list
 * `?ids=<id>,<id>,…`  → { counts, incomplete }        — for delete confirmations
 *
 * `incomplete` lists collections that could not be searched; a caller must not
 * read an empty result as "unused" while it is non-empty.
 */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id");
  const ids = url.searchParams.get("ids");

  if (id) {
    const asset = await assets.findById(id);
    if (!asset) return Response.json({ error: "Not found." }, { status: 404 });

    const { refs, incomplete } = await findAssetUsage(config, asset.storagePath);
    const total = refs.reduce((sum, ref) => sum + ref.docs.length, 0);
    return Response.json({ usage: refs, total, incomplete });
  }

  if (ids) {
    const requested = ids
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 200);

    const records = (await Promise.all(requested.map((assetId) => assets.findById(assetId)))).filter(
      (asset): asset is NonNullable<typeof asset> => !!asset,
    );

    const { counts: byPath, incomplete } = await countAssetUsage(
      config,
      records.map((asset) => asset.storagePath),
    );
    const counts: Record<string, number> = {};
    for (const asset of records) counts[asset._id] = byPath[asset.storagePath] ?? 0;

    return Response.json({ counts, incomplete });
  }

  return Response.json({ error: "Pass ?id= or ?ids=." }, { status: 400 });
};
