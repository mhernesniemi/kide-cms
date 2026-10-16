<script lang="ts">
  type Item = { title?: string; description?: string };
  let { heading, items = [] }: { heading?: string; items?: Item[] } = $props();
  const hasContent = $derived(Boolean(heading) || items.length > 0);
</script>

{#if hasContent}
  <section class="py-12 sm:py-16">
    {#if heading}<h2 class="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>{/if}
    {#if items.length > 0}
      <dl class="m-0 max-w-2xl divide-y divide-gray-200">
        {#each items as item, index (index)}
          <div class="py-5 first:pt-0 last:pb-0">
            {#if item.title}<dt class="mb-1.5 font-medium">{item.title}</dt>{/if}
            {#if item.description}<dd class="m-0 text-sm leading-relaxed text-gray-600">{item.description}</dd>{/if}
          </div>
        {/each}
      </dl>
    {/if}
  </section>
{/if}
