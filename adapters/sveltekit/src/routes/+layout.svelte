<script lang="ts">
  import "@/styles/public.css";
  import { onMount } from "svelte";

  let { children } = $props();

  // Live preview + edit bar; a no-op unless an editor opened the page.
  onMount(() => {
    import("@kidecms/core/client/preview");
  });
</script>

{@render children()}
