// Vite loads vite.config.ts with plain Node, which can't run this package's TypeScript
// source (type stripping refuses node_modules) — tsx compiles the plugin graph instead.
import { tsImport } from "tsx/esm/api";

const { kideSvelteKit } = await tsImport("./vite.ts", import.meta.url);

export { kideSvelteKit };
