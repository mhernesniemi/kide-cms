// Production entry (`pnpm start`). adapter-node rejects request bodies over BODY_SIZE_LIMIT
// (512K by default) before Kide sees them, which would block ordinary uploads. Kide's upload
// route enforces its own limits (50 MB per file, 20 files per request by default), so the
// adapter's ceiling only needs to clear those; set BODY_SIZE_LIMIT yourself to change it.
process.env.BODY_SIZE_LIMIT ??= "1001M";
const entry = "./build/index.js"; // not a literal: the build output doesn't exist at type-check time
await import(entry);
