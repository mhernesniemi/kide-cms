// Platform selector: points at the active profile (src/cms/platform/node|cloudflare/storage.ts).
// A real relative re-export so it resolves under both Vite and tsx. The scaffolder flips this
// one line to the cloudflare profile; both profiles live in the tree.
export * from "../platform/node/storage";
