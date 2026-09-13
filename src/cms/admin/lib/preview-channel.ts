// Live preview is scoped per document: the edit view stamps
// `data-preview-channel="<collection>:<id>"` and links the preview tab with the same
// key in `?preview=`, so an editor only drives the preview of its own document
// (a single shared channel let any open edit tab overwrite every preview tab).

export const previewChannelName = (key: string) => `cms-preview:${key}`;

/** Opens this edit view's preview channel, or null when the document has no preview. */
export function openPreviewChannel(): BroadcastChannel | null {
  if (typeof document === "undefined" || typeof BroadcastChannel === "undefined") return null;
  const key = document.querySelector<HTMLElement>("[data-preview-channel]")?.dataset.previewChannel;
  return key ? new BroadcastChannel(previewChannelName(key)) : null;
}
