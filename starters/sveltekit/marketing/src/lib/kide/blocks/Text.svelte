<script lang="ts">
  let { heading, html = "" }: { heading?: string; html?: string } = $props();
  const hasContent = $derived(Boolean(heading) || Boolean(html));
</script>

{#if hasContent}
  <section class="py-4 sm:py-5">
    <div class="max-w-2xl">
      {#if heading}<h2 class="mb-5 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>{/if}
      {#if html}
        <div class="prose prose-gray">{@html html}</div>
      {/if}
    </div>
  </section>
{/if}
