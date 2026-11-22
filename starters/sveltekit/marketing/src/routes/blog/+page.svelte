<script lang="ts">
  let { data } = $props();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
</script>

<svelte:head>
  <title>Blog</title>
  <meta name="description" content="News, guides, and customer stories." />
</svelte:head>

<main class="mx-auto max-w-2xl px-6 py-14 sm:py-20">
  <h1 class="mb-10 text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
  {#if data.posts.length === 0}<p class="text-gray-500">No published posts yet.</p>{/if}
  <ul class="m-0 list-none divide-y divide-gray-100 p-0">
    {#each data.posts as post (post.slug)}
      <li>
        <a href={`/blog/${post.slug}`} class="group block py-6 no-underline">
          <article>
            {#if post.publishedAt}
              <time class="mb-1 block text-xs text-gray-400" datetime={post.publishedAt}>
                {formatDate(post.publishedAt)}
              </time>
            {/if}
            <h2 class="mb-1.5 text-lg font-medium transition-colors group-hover:text-gray-500">{post.title}</h2>
            {#if post.excerpt}<p class="m-0 text-sm leading-relaxed text-gray-600">{post.excerpt}</p>{/if}
          </article>
        </a>
      </li>
    {/each}
  </ul>
</main>
