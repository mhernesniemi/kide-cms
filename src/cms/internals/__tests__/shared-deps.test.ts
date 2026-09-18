import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeSharedDeps, formatConflicts, satisfiesRange } from "../shared-deps";

describe("satisfiesRange", () => {
  it("handles caret ranges by their left-most non-zero component", () => {
    expect(satisfiesRange("1.8.0", "^1.3.0")).toBe(true);
    expect(satisfiesRange("1.2.9", "^1.3.0")).toBe(false);
    expect(satisfiesRange("2.0.0", "^1.3.0")).toBe(false);
    expect(satisfiesRange("0.577.3", "^0.577.0")).toBe(true);
    expect(satisfiesRange("0.578.0", "^0.577.0")).toBe(false);
    expect(satisfiesRange("1.47.0", "^0.577.0")).toBe(false);
    expect(satisfiesRange("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfiesRange("0.0.4", "^0.0.3")).toBe(false);
  });

  it("handles tilde and exact versions", () => {
    expect(satisfiesRange("3.31.9", "~3.31.3")).toBe(true);
    expect(satisfiesRange("3.32.0", "~3.31.3")).toBe(false);
    expect(satisfiesRange("3.31.3", "3.31.3")).toBe(true);
    expect(satisfiesRange("3.31.4", "3.31.3")).toBe(false);
  });

  it("returns null for ranges it does not understand", () => {
    expect(satisfiesRange("1.0.0", ">=1.0.0 <2.0.0")).toBeNull();
    expect(satisfiesRange("1.0.0", "workspace:*")).toBeNull();
    expect(satisfiesRange("not-a-version", "^1.0.0")).toBeNull();
  });
});

describe("analyzeSharedDeps", () => {
  let root: string;

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const pkg = (dir: string, name: string, version: string) => {
    const pkgDir = path.join(dir, "node_modules", name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name, version }));
  };

  // project/node_modules holds the project's copies; project/core is the package
  // with its own nested node_modules, like pnpm's layout.
  const setup = () => {
    root = mkdtempSync(path.join(tmpdir(), "kide-shared-deps-"));
    const project = path.join(root, "project");
    const core = path.join(project, "core");
    mkdirSync(core, { recursive: true });
    writeFileSync(path.join(project, "package.json"), "{}");
    writeFileSync(path.join(core, "package.json"), "{}");
    return { project, core };
  };

  it("dedupes compatible copies and reports incompatible ones", () => {
    const { project, core } = setup();
    pkg(project, "@base-ui/react", "1.8.0");
    pkg(core, "@base-ui/react", "1.4.0");
    pkg(project, "lucide-react", "1.47.0");
    pkg(core, "lucide-react", "0.577.0");
    pkg(project, "ai", "7.0.0");
    pkg(core, "ai", "6.0.0");

    const report = analyzeSharedDeps({
      projectRoot: project,
      packageFile: path.join(core, "package.json"),
      dependencies: { "@base-ui/react": "^1.3.0", "lucide-react": "^0.577.0", ai: "^6.0.0" },
    });

    expect(report.dedupe).toEqual(["@base-ui/react"]);
    expect(report.conflicts).toEqual([{ name: "lucide-react", range: "^0.577.0", projectVersion: "1.47.0" }]);
    expect(formatConflicts(report.conflicts)).toContain('pnpm add lucide-react@"^0.577.0"');
  });

  it("compares real paths, so pnpm symlinks to one store entry count as one copy", () => {
    const { project, core } = setup();
    const store = path.join(project, "node_modules", ".pnpm");
    const entry = (name: string, version: string) => {
      const dir = path.join(store, `${name}@${version}`, "node_modules", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version }));
      return dir;
    };
    const link = (from: string, name: string, target: string) => {
      mkdirSync(path.join(from, "node_modules"), { recursive: true });
      symlinkSync(target, path.join(from, "node_modules", name), "dir");
    };
    const shared = entry("clsx", "2.1.1");
    link(project, "clsx", shared);
    link(core, "clsx", shared);
    link(project, "tailwind-merge", entry("tailwind-merge", "3.7.0"));
    link(core, "tailwind-merge", entry("tailwind-merge", "3.5.0"));

    const report = analyzeSharedDeps({
      projectRoot: project,
      packageFile: path.join(core, "package.json"),
      dependencies: { clsx: "^2.1.1", "tailwind-merge": "^3.5.0" },
    });

    expect(report).toEqual({ dedupe: ["tailwind-merge"], conflicts: [] });
  });

  it("ignores packages the project does not have its own copy of", () => {
    const { project, core } = setup();
    pkg(core, "@base-ui/react", "1.4.0");
    // Only the project's copy exists, so the package resolves the same one.
    pkg(project, "clsx", "2.1.1");

    const report = analyzeSharedDeps({
      projectRoot: project,
      packageFile: path.join(core, "package.json"),
      dependencies: { "@base-ui/react": "^1.3.0", clsx: "^2.1.1" },
    });

    expect(report).toEqual({ dedupe: [], conflicts: [] });
  });
});
