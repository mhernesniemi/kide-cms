<script lang="ts">
  import "@/styles/public.css";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  let { data, children } = $props();

  // Live preview + edit bar: loaded on the first page, and the edit bar follows each
  // client-side navigation. A no-op unless an editor opened the page.
  afterNavigate(({ type }) => {
    import("@kidecms/core/client/preview").then((preview) => {
      if (type !== "enter") preview.refreshEditBar();
    });
  });
</script>

<!-- cmsDoc ("<collection>:<id>") marks which document this page renders — the edit bar
     uses it to show logged-in editors an "Edit this page" chip. -->
<div
  class="flex min-h-screen flex-col overflow-x-clip bg-white text-gray-950 antialiased"
  data-cms-doc={page.data.cmsDoc}
>
  <header class="border-b border-gray-200">
    <div class="mx-auto flex max-w-5xl items-center gap-10 px-6 py-5">
      <a href="/" class="text-base font-semibold tracking-tight no-underline">Acme</a>
      {#if data.menuItems.length > 0}
        <nav>
          <ul class="flex list-none gap-7 p-0">
            {#each data.menuItems as item (item.id)}
              <li>
                <a
                  href={item.href}
                  target={item.target || undefined}
                  rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                  class="text-sm text-gray-500 no-underline transition-colors hover:text-gray-950"
                >
                  {item.label}
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
      <a
        href="/admin"
        class="ml-auto rounded-full border border-gray-200 px-3.5 py-1.5 text-sm text-gray-600 no-underline transition-colors hover:border-gray-300 hover:text-gray-950"
      >
        Open admin
      </a>
    </div>
  </header>
  <div class="flex-1">
    {@render children()}
  </div>
  <footer class="border-t border-gray-200">
    <div class="mx-auto flex max-w-5xl items-baseline justify-between px-6 py-10">
      <p class="m-0 text-sm text-gray-500">&copy; {new Date().getFullYear()} Acme</p>
      <p class="m-0 text-sm text-gray-400">
        Built with <a href="https://kide.dev" class="text-gray-500 no-underline hover:text-gray-950">Kide CMS</a>
      </p>
    </div>
  </footer>
</div>
