<script lang="ts">
  import type { CmsFormData } from "@/lib/server/forms";
  import CmsForm from "../CmsForm.svelte";

  let { heading, intro, cmsForm }: { heading?: string; intro?: string; cmsForm?: CmsFormData | null } = $props();
</script>

{#if cmsForm}
  <section class="max-w-2xl py-8 sm:py-10">
    {#if heading}<h2 class="mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h2>{/if}
    {#if intro}<p class="mb-8 leading-relaxed text-gray-600">{intro}</p>{/if}
    <CmsForm form={cmsForm} />
  </section>
{:else if import.meta.env.DEV}
  <div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
    Form block: no form selected, or the referenced form was deleted.
  </div>
{/if}
