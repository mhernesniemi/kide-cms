<script lang="ts">
  import ContentRenderer from "@/lib/kide/ContentRenderer.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<article class="mx-auto max-w-2xl px-4 py-8">
  <a href="/" class="text-sm text-teal-700">&larr; Back</a>
  <h1 data-cms="title" class="mt-4 mb-2 text-2xl font-semibold">
    {data.title}
  </h1>
  <div data-cms="body">
    <ContentRenderer segments={data.body} />
  </div>
</article>
