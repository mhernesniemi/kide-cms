// Pure, dependency-free YouTube URL helpers. Imported directly by path
// (`@/cms/core/youtube`) from both the public Astro renderer and the admin React
// field, so it must stay free of any server-only imports.

/**
 * Extract the 11-character video id from any common YouTube URL form:
 * `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/v/`. Accepts a bare id too.
 * Returns null when no id can be parsed.
 */
export function getYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // A bare 11-char id (the value editors sometimes paste).
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/, // watch?v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/, // youtu.be/ID
    /\/embed\/([a-zA-Z0-9_-]{11})/, // /embed/ID
    /\/shorts\/([a-zA-Z0-9_-]{11})/, // /shorts/ID
    /\/v\/([a-zA-Z0-9_-]{11})/, // /v/ID
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match) return match[1];
  }
  return null;
}

/** Thumbnail URL for a video id (hqdefault always exists for valid ids). */
export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** Privacy-enhanced (no-cookie) embed URL for a video id. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
