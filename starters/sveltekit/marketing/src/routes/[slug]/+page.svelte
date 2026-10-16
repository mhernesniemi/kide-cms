<script lang="ts">
  import ContentRenderer from "@/lib/kide/ContentRenderer.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
  {#if data.seoDescription}<meta name="description" content={data.seoDescription} />{/if}
</svelte:head>

<article class="mx-auto max-w-5xl px-6">
  <h1 data-cms="title" class="pt-14 pb-4 text-3xl font-semibold tracking-tight sm:text-4xl">{data.title}</h1>
  <div data-cms="body">
    <ContentRenderer segments={data.body} />
  </div>
</article>
