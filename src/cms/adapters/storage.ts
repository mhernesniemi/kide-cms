// Platform selector: points at the active profile (node | cloudflare). The
// scaffolder flips this one line to the cloudflare profile. Same package
// specifier in both distribution modes (embedded workspace or installed).
export * from "@kidecms/core/platform/node/storage";
