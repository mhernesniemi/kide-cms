import { parseList, renderRichText, resolveLinkUrl, stripMissingAssetImages, type PrepareBlock } from "@kidecms/core";
import type { RichTextDocument, StoredLink } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";
import { loadForm } from "@/lib/server/forms";

const cmsRuntime = cms as Record<string, any>;

// Stored as an object, or as the serialized form-field string.
const parseRichText = (value: unknown): RichTextDocument | null => {
  if (typeof value !== "string") return value && typeof value === "object" ? (value as RichTextDocument) : null;
  try {
    return JSON.parse(value) as RichTextDocument;
  } catch {
    return null;
  }
};

const linkProps = async (value: unknown) => {
  const link = value && typeof value === "object" ? (value as StoredLink) : null;
  // Resolves the linked document's current route (slug edits included); external
  // and hand-typed URLs pass through scheme-checked.
  const href = await resolveLinkUrl(cmsRuntime, link);
  // An empty label falls back to the linked document's title.
  return { href, label: link?.label || link?.title || "", newTab: Boolean(link?.newTab) };
};

// Svelte components can't await, so anything a block needs from the server (a linked
// document's URL, a related record) is loaded here. Page loads pass this to
// resolveBlocks / resolveContent, and live preview runs it too.
export const createPrepareBlock =
  ({ url }: { url: URL; status: "published" | "any" }): PrepareBlock =>
  async (type, props) => {
    switch (type) {
      case "hero":
        return { ...props, link: await linkProps(props.cta) };
      case "cta":
        return { ...props, link: await linkProps(props.button) };
      case "text": {
        const document = parseRichText(props.content);
        // Inline images whose upload is gone would render as a <picture> of 404s.
        const html = document?.children?.length ? renderRichText(await stripMissingAssetImages(document)) : "";
        return { ...props, html: html ?? "" };
      }
      case "features":
      case "faq":
        return { ...props, items: parseList<{ title?: string; description?: string }>(props.items) };
      case "form": {
        const formDoc = props.form ? await cmsRuntime.forms.findById(String(props.form)) : null;
        return {
          ...props,
          cmsForm: formDoc ? await loadForm(String(formDoc.slug), url, { page: url.pathname }) : null,
        };
      }
      default:
        return props;
    }
  };
