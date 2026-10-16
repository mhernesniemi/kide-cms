<script lang="ts">
  type Link = { href: string | null; label: string; newTab: boolean };
  let { heading, body, link }: { heading?: string; body?: string; link?: Link } = $props();
  const hasContent = $derived(Boolean(heading || body || (link?.label && link.href)));
</script>

{#if hasContent}
  <section class="mx-[calc(50%-50vw)] border-b border-gray-200 bg-gray-50">
    <div class="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <div class="max-w-2xl">
        {#if heading}<h1 class="mb-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{heading}</h1>{/if}
        {#if body}<p class="mb-8 text-lg leading-relaxed text-gray-600">{body}</p>{/if}
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
      </div>
    </div>
  </section>
{/if}
