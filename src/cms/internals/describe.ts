/**
 * `pnpm cms:describe` — emit the content-model manifest a migration agent reads
 * INSTEAD of reverse-engineering the codebase:
 *   - `.kide/model.json` — machine-readable (collections, fields, controls,
 *     value shapes, block registry, content-AST schema, field-type table)
 *   - `MODEL.md` — the same, human/agent-readable
 *
 * Pure config → manifest; no database needed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describeModel, renderModelMarkdown } from "@/cms/core";
import config from "@/cms/cms.config";

const outDir = path.join(process.cwd(), ".kide");
mkdirSync(outDir, { recursive: true });

const model = describeModel(config);
writeFileSync(path.join(outDir, "model.json"), JSON.stringify(model, null, 2) + "\n");
writeFileSync(path.join(process.cwd(), "MODEL.md"), renderModelMarkdown(config));

console.log(`[cms:describe] wrote .kide/model.json (${model.collections.length} collections) and MODEL.md`);
