import { stripMissingAssetImages } from "./assets";
import { renderRichText } from "./richtext";
import { SHARED_BLOCK_TYPE, SHARED_SECTIONS_COLLECTION, isSharedBlockReference } from "./shared-sections";
import type { ContentDocument } from "./define";
import { contentSegments } from "./values";

// Server-side data resolution for block/content renderers whose host can't await
// inside components (Svelte). Mirrors what the Astro renderers do inline: shared
// sections are swapped for their block, missing ones become a placeholder under
// `status: "any"` (previews) and vanish otherwise.

type RenderStatus = "published" | "any";
type CmsLike = Record<string, any>;

/** Loads whatever a block component needs that it can't await itself (link targets, related docs). */
export type PrepareBlock = (type: string, props: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type RenderBlock = Record<string, unknown> & { type?: unknown };

export async function resolveBlocks(
  cms: CmsLike,
  blocks: Array<Record<string, unknown>> = [],
  status: RenderStatus = "published",
  prepare?: PrepareBlock,
): Promise<RenderBlock[]> {
  const resolved: RenderBlock[] = [];
  for (const block of blocks) {
    if (!isSharedBlockReference(block)) {
      resolved.push(block);
      continue;
    }
    const shared = await cms[SHARED_SECTIONS_COLLECTION]?.findById(block.ref, { status });
    const sharedBlock = shared?.block;
    if (sharedBlock && typeof sharedBlock === "object") {
      resolved.push({
        ...(sharedBlock as Record<string, unknown>),
        _sharedSection: { id: block.ref, title: shared.title },
      });
    } else if (status === "any") {
      resolved.push({ type: SHARED_BLOCK_TYPE, ref: block.ref, title: block.title ?? "Missing shared section" });
    }
  }
  if (!prepare) return resolved;
  return Promise.all(
    resolved.map(async (block) =>
      block.type === SHARED_BLOCK_TYPE
        ? block
        : { ...(await prepare(String(block.type ?? ""), block)), type: block.type },
    ),
  );
}

export type RenderSegment =
  | { kind: "richText"; html: string }
  | { kind: "block"; blockType: string; fields: Record<string, unknown> }
  | { kind: "missingShared"; ref: string };

export async function resolveContent(
  cms: CmsLike,
  content?: ContentDocument | null,
  status: RenderStatus = "published",
  prepare?: PrepareBlock,
): Promise<RenderSegment[]> {
  // Trim trailing empty paragraphs (an editor artifact of ending the document
  // with a block) so they don't render as visible empty space.
  const children = [...(content?.children ?? [])];
  while (children.length > 0) {
    const last = children[children.length - 1] as { type?: string; children?: unknown[] };
    if (last.type !== "paragraph" || (last.children?.length ?? 0) > 0) break;
    children.pop();
  }
  const resolved: RenderSegment[] = [];
  for (const segment of contentSegments(content ? { ...content, children } : content)) {
    if (segment.kind === "richText") {
      // Inline images whose upload is gone would render as a <picture> of 404s.
      resolved.push({ kind: "richText", html: renderRichText(await stripMissingAssetImages(segment.doc)) ?? "" });
      continue;
    }
    if (segment.block.blockType !== SHARED_BLOCK_TYPE) {
      resolved.push({ kind: "block", blockType: segment.block.blockType, fields: segment.block.fields ?? {} });
      continue;
    }
    const ref = String(segment.block.fields?.ref ?? "");
    const shared = ref ? await cms[SHARED_SECTIONS_COLLECTION]?.findById(ref, { status }) : null;
    const sharedBlock = shared?.block;
    if (sharedBlock && typeof sharedBlock === "object") {
      const { type, ...fields } = sharedBlock as Record<string, unknown>;
      resolved.push({ kind: "block", blockType: String(type ?? ""), fields });
    } else if (status === "any") {
      resolved.push({ kind: "missingShared", ref });
    }
  }
  if (!prepare) return resolved;
  return Promise.all(
    resolved.map(async (segment) =>
      segment.kind === "block" ? { ...segment, fields: await prepare(segment.blockType, segment.fields) } : segment,
    ),
  );
}
