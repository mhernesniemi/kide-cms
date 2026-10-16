<script lang="ts">
  import BlockRenderer from "@/lib/kide/BlockRenderer.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Acme</title>
  <meta name="description" content={data.seoDescription ?? "A marketing site powered by Kide CMS."} />
</svelte:head>

<main class="mx-auto max-w-5xl px-6" data-cms="blocks">
  {#if data.blocks.length > 0}
    <BlockRenderer blocks={data.blocks} />
  {:else}
    <p class="py-20 text-gray-500">
      No content yet. Open the <a href="/admin" class="text-gray-950 underline">admin</a> and publish
      the Front page.
    </p>
  {/if}
</main>
