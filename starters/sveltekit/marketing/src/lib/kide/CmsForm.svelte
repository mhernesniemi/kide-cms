<script lang="ts">
  import type { CmsFormData } from "@/lib/server/forms";

  // Load the data with loadForm() from "@/lib/server/forms" in your page's load function.
  let { form }: { form: CmsFormData } = $props();

  const inputClass =
    "rounded-md border border-gray-300 px-3.5 py-2.5 transition-colors outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-950/10";
</script>

{#if !form.found}
  <p class="rounded border border-dashed border-gray-300 p-6 text-sm text-gray-500">
    This form has not been set up yet. Create a form with the slug "{form.slug}" in the admin UI.
  </p>
{:else}
  <form method="POST" action={`/api/cms/forms/submit/${form.slug}`} class="flex flex-col gap-4">
    <!-- Honeypot — bots fill visible inputs; humans never see this one -->
    <input
      type="text"
      name="_hp"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
      style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;"
    />

    <!-- Context metadata — page title, URL, or anything else the host page wants to attach -->
    {#each Object.entries(form.context) as [key, value] (key)}
      <input type="hidden" name={`_ctx_${key}`} value={String(value)} />
    {/each}

    {#each form.fields as field (field.name)}
      {@const inputId = `${form.slug}-${field.name}`}
      {#if field.type === "textarea"}
        <label for={inputId} class="flex flex-col gap-1 text-sm">
          <span class="font-medium"
            >{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span
          >
          <textarea
            id={inputId}
            name={field.name}
            rows={field.rows ?? 4}
            placeholder={field.placeholder ?? ""}
            required={field.required}
            class={inputClass}></textarea>
        </label>
      {:else if field.type === "select"}
        <label for={inputId} class="flex flex-col gap-1 text-sm">
          <span class="font-medium"
            >{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span
          >
          <select id={inputId} name={field.name} required={field.required} class={inputClass}>
            <option value="">Select…</option>
            {#each field.options ?? [] as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </label>
      {:else if field.type === "radio"}
        <!-- A radio group needs the label for the whole group, hence fieldset/legend. -->
        <fieldset class="flex flex-col gap-1 text-sm">
          <legend class="font-medium"
            >{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</legend
          >
          {#each field.options ?? [] as opt, index (opt)}
            <label for={`${inputId}-${index}`} class="flex items-center gap-2">
              <input id={`${inputId}-${index}`} type="radio" name={field.name} value={opt} required={field.required} />
              <span>{opt}</span>
            </label>
          {/each}
        </fieldset>
      {:else if field.type === "checkbox"}
        <label for={inputId} class="flex items-center gap-2 text-sm">
          <input id={inputId} type="checkbox" name={field.name} required={field.required} />
          <span
            >{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span
          >
        </label>
      {:else}
        <!-- text | email | tel | number — the block type doubles as the input type -->
        <label for={inputId} class="flex flex-col gap-1 text-sm">
          <span class="font-medium"
            >{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span
          >
          <input
            id={inputId}
            type={field.type}
            name={field.name}
            placeholder={field.placeholder ?? ""}
            required={field.required}
            maxlength={field.maxLength}
            min={field.min}
            max={field.max}
            class={inputClass}
          />
        </label>
      {/if}
    {/each}

    <button
      type="submit"
      class="self-start rounded-full bg-gray-950 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
    >
      Submit
    </button>

    {#if form.submitted}<p class="text-sm text-green-700">{form.successMessage}</p>{/if}
    {#if form.formError}<p class="text-sm text-red-700">{form.formError}</p>{/if}
  </form>
{/if}
