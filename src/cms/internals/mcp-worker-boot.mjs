// Bootstraps the MCP worker child process: registers tsx, then imports the
// TypeScript worker — same pattern as cli.mjs, works in embedded and package mode.
import { register } from "tsx/esm/api";

register();
await import(new URL("./mcp-worker.ts", import.meta.url).href);
