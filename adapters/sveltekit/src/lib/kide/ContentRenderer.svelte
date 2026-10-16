<script lang="ts">
  import type { RenderSegment } from "@kidecms/core";
  import { blockComponents, blockFileName } from "./blocks";

  // Segments come from `resolveContent(cms, doc.body)` in your load function.
  let { segments = [] }: { segments?: RenderSegment[] } = $props();
</script>

<div class="cms-content flex flex-col gap-6">
  {#each segments as segment, index (index)}
    {#if segment.kind === "richText"}
      <div class="prose max-w-none">{@html segment.html}</div>
    {:else if segment.kind === "missingShared"}
      <div class="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Shared section is unavailable.
      </div>
    {:else}
      {@const Block = blockComponents[segment.blockType]}
      {#if Block}
        <Block type={segment.blockType} {...segment.fields} />
      {:else if import.meta.env.DEV}
        <div
          data-block-type={segment.blockType}
          class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500"
        >
          Unstyled block: <code>{segment.blockType}</code> (add
          <code>src/lib/kide/blocks/{blockFileName(segment.blockType)}</code>)
        </div>
      {/if}
    {/if}
  {/each}
</div>
