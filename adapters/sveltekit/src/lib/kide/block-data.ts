import type { PrepareBlock } from "@kidecms/core";

// Svelte components can't await, so anything a block needs from the server (a linked
// document's URL, a related record) is loaded here. Page loads pass this to
// resolveBlocks / resolveContent, and live preview runs it too.
export const createPrepareBlock =
  (_context: { url: URL; status: "published" | "any" }): PrepareBlock =>
  async (_type, props) =>
    props;
