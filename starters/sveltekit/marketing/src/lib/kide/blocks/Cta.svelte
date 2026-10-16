<script lang="ts">
  type Link = { href: string | null; label: string; newTab: boolean };
  let { heading, body, link }: { heading?: string; body?: string; link?: Link } = $props();
  const hasContent = $derived(Boolean(heading || body || (link?.label && link.href)));
</script>

{#if hasContent}
  <section class="my-8 rounded-2xl bg-gray-100 px-6 py-12 text-center sm:my-10 sm:py-14">
    {#if heading}<h2 class="mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>{/if}
    {#if body}<p class="mx-auto mb-8 max-w-xl leading-relaxed text-gray-600">{body}</p>{/if}
    {#if link?.label && link.href}
      <a
        href={link.href}
        target={link.newTab ? "_blank" : undefined}
        rel={link.newTab ? "noopener noreferrer" : undefined}
        class="inline-block rounded-full bg-gray-950 px-6 py-2.5 text-sm font-medium text-white no-underline transition-colors hover:bg-gray-700"
      >
        {link.label}
      </a>
    {/if}
  </section>
{/if}
