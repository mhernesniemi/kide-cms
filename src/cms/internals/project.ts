/**
 * Resolve project-owned files (cms.config, runtime, .generated) from the
 * project working directory instead of static imports. These scripts must work
 * identically whether the CMS runtime is embedded in the project tree or
 * installed as a package dependency — a static import of a project file would
 * only exist in the embedded case.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { CMSConfig } from "../core";

const projectRoot = process.cwd();

export const projectPath = (...segments: string[]) => path.join(projectRoot, ...segments);

const importProject = (relativePath: string) => import(pathToFileURL(projectPath(relativePath)).href);

/** Wire the runtime (DB / storage / email adapters) as a side effect. */
export const loadProjectRuntime = () => importProject("src/cms/runtime.ts");

export const loadProjectConfig = async (): Promise<CMSConfig> => (await importProject("src/cms/cms.config.ts")).default;

export const loadGeneratedApi = () => importProject("src/cms/.generated/api.ts");

export const loadGeneratedSchema = () => importProject("src/cms/.generated/schema.ts");
