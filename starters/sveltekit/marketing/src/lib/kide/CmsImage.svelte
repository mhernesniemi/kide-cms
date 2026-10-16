<script lang="ts">
  import type { PictureData } from "@/lib/server/images";

  // `picture` comes from cmsPicture() in "@/lib/server/images", called in your load function.
  let {
    picture,
    alt,
    loading = "lazy",
    fetchpriority = "auto",
    class: className,
  }: {
    picture: PictureData | null;
    alt: string;
    loading?: "eager" | "lazy";
    fetchpriority?: "high" | "auto" | "low";
    class?: string;
  } = $props();
</script>

{#if picture?.kind === "picture"}
  <picture>
    {#each picture.sources as source, index (index)}
      <source media={source.media} srcset={source.srcset} type={source.type} sizes={source.sizes} />
    {/each}
    <img
      src={picture.img.src}
      width={picture.img.width}
      height={picture.img.height}
      {alt}
      {loading}
      {fetchpriority}
      class={className}
      style={picture.img.style}
    />
  </picture>
{:else if picture}
  <img src={picture.img.src} {alt} {loading} {fetchpriority} class={className} />
{/if}
