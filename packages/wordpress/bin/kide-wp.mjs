#!/usr/bin/env node
// The importer ships as TypeScript; tsx loads it.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
