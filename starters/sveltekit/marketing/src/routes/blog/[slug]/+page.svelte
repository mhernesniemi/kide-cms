<script lang="ts">
  import CmsImage from "@/lib/kide/CmsImage.svelte";
  import ContentRenderer from "@/lib/kide/ContentRenderer.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
  {#if data.seoDescription}<meta name="description" content={data.seoDescription} />{/if}
</svelte:head>

<article class="mx-auto max-w-2xl px-6 py-14 sm:py-20">
  <a href="/blog" class="text-sm text-gray-500 no-underline transition-colors hover:text-gray-950">&larr; All posts</a>
  <h1 data-cms="title" class="mt-6 mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">{data.title}</h1>
  <CmsImage
    picture={data.image}
    alt={data.title}
    loading="eager"
    fetchpriority="high"
    class="mb-6 h-auto w-full rounded-lg"
  />
  <p data-cms="excerpt" class="mb-8 text-lg leading-relaxed text-gray-600 empty:hidden">{data.excerpt}</p>
  <div data-cms="body" class="prose prose-gray max-w-none">
    <ContentRenderer segments={data.body} />
  </div>
</article>
