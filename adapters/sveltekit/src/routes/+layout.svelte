<script lang="ts">
  import "@/styles/public.css";
  import { afterNavigate } from "$app/navigation";

  let { children } = $props();

  // Live preview + edit bar: loaded on the first page, and the edit bar follows each
  // client-side navigation. A no-op unless an editor opened the page.
  afterNavigate(({ type }) => {
    import("@kidecms/core/client/preview").then((preview) => {
      if (type !== "enter") preview.refreshEditBar();
    });
  });
</script>

{@render children()}
