// Kide's mark, inlined so the admin keeps its own icon whatever the project's public/favicon is.
// Transparent, with a blue that holds up on light and dark browser chrome.
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">' +
  "<style>path{fill:#2e5bd8}@media (prefers-color-scheme:dark){path{fill:#7aa2f7}}</style>" +
  '<path fill-rule="evenodd" d="M1 1h30v30H1zM4 4v24h24V4zM7 7h18v18H7zM10 10v12h12V10z"/>' +
  "</svg>";

export const ADMIN_FAVICON = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
