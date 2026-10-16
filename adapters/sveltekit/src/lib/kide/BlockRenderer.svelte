<script lang="ts">
  import type { RenderBlock } from "@kidecms/core";
  // Not from the package root: that would pull the server runtime into the browser bundle.
  import { SHARED_BLOCK_TYPE } from "@kidecms/core/shared-sections";
  import { blockComponents, blockFileName } from "./blocks";

  // Blocks come from `resolveBlocks(cms, doc.blocks)` in your load function.
  let { blocks = [] }: { blocks?: RenderBlock[] } = $props();
</script>

<div class="flex flex-col">
  {#each blocks as block, index (index)}
    {@const type = String(block.type ?? "")}
    {@const Block = blockComponents[type]}
    {#if type === SHARED_BLOCK_TYPE}
      <div class="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Shared section is unavailable.
      </div>
    {:else if Block}
      <Block {...block} />
    {:else if import.meta.env.DEV}
      <!-- No component for this block type — add src/lib/kide/blocks/<Type>.svelte to render it. -->
      <div
        data-block-type={type}
        class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500"
      >
        Unstyled block: <code>{type}</code> (add <code>src/lib/kide/blocks/{blockFileName(type)}</code>)
      </div>
    {/if}
  {/each}
</div>
