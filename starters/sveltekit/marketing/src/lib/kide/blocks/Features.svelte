<script lang="ts">
  type Item = { title?: string; description?: string };
  let { heading, items = [] }: { heading?: string; items?: Item[] } = $props();
  const hasContent = $derived(Boolean(heading) || items.length > 0);
</script>

{#if hasContent}
  <section class="py-12 sm:py-16">
    {#if heading}<h2 class="mb-10 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>{/if}
    {#if items.length > 0}
      <div class="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {#each items as item, index (index)}
          <div class="border-l border-gray-200 pl-5">
            {#if item.title}<p class="mb-2 font-medium">{item.title}</p>{/if}
            {#if item.description}<p class="m-0 text-sm leading-relaxed text-gray-600">{item.description}</p>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}
