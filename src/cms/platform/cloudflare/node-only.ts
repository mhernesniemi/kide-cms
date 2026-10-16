// Stand-in for Node-only modules Kide loads lazily outside Workers (sharp for image
// resizing, wrangler for the local platform proxy). The SvelteKit Worker's wrangler.toml
// aliases them here so bundling succeeds; Workers code paths never call them.
const unavailable = () => {
  throw new Error("[kide] This module is Node-only and is not available on Cloudflare Workers.");
};

export default unavailable;
export const getPlatformProxy = unavailable;
