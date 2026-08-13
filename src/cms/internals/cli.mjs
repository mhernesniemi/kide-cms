#!/usr/bin/env node
/**
 * `kide <command>` — runs the CMS runner scripts against the project in cwd.
 * Plain JS launcher: registers tsx, then imports the TypeScript script, so the
 * same bin works whether the runtime is an installed package or an embedded
 * workspace package.
 */
import { register } from "tsx/esm/api";

const COMMANDS = {
  generate: "./generator.ts",
  push: "./push.ts",
  seed: "./seed.ts",
  admin: "./create-admin.ts",
  reindex: "./reindex.ts",
  describe: "./describe.ts",
  upgrade: "./upgrade.ts",
  restore: "./restore.ts",
  eject: "./eject.ts",
  mcp: "./mcp.ts",
};

const [command, ...rest] = process.argv.slice(2);

if (!command || !(command in COMMANDS)) {
  console.error(`Usage: kide <command> [options]\n\nCommands:\n  ${Object.keys(COMMANDS).join("\n  ")}`);
  process.exit(command ? 1 : 0);
}

// Scripts parse their own flags from process.argv.slice(2).
process.argv = [process.argv[0], process.argv[1], ...rest];

register();
await import(new URL(COMMANDS[command], import.meta.url).href);
