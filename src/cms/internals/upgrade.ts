/**
 * `pnpm cms:upgrade [target-tag]` - prepare and optionally apply a release-tag
 * upgrade from the upstream Kide template into this vendored project.
 *
 * The command treats `.kide-version` as the source of truth, writes an upgrade
 * packet under `.kide/upgrade/`, applies only clearly managed CMS runtime paths,
 * and leaves project-owned files as review material for a human or any coding
 * agent.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type VersionStamp = {
  template?: string;
  kideVersion?: string | null;
  ref?: string;
  commit?: string | null;
  target?: string;
  corePath?: string;
  upgrades?: UpgradeRecord[];
  [key: string]: unknown;
};

type UpgradeRecord = {
  from: string;
  to: string;
  fromCommit: string | null;
  toCommit: string;
  at: string;
  packet: string;
  applied: boolean;
};

type Args = {
  targetRef?: string;
  fromRef?: string;
  repo?: string;
  corePath?: string;
  apply?: boolean;
  allowDirty: boolean;
  agent: "auto" | "none" | "claude" | "codex" | "cursor";
  help: boolean;
};

type AgentInfo = {
  id: "claude" | "codex" | "cursor";
  label: string;
  command: string;
};

const DEFAULT_REPO = "https://github.com/mhernesniemi/kide-cms.git";
const DEFAULT_CORE_PATH = "src/cms";

const AGENTS: AgentInfo[] = [
  { id: "claude", label: "Claude Code", command: "claude" },
  { id: "codex", label: "Codex", command: "codex" },
  { id: "cursor", label: "Cursor", command: "cursor" },
];

const usage = `Usage:
  pnpm cms:upgrade [target-tag]

Options:
  --from <ref>          Override the source release/ref from .kide-version
  --repo <url|path>     Override the upstream Kide core repo
  --core-path <path>    Managed CMS path in this project (default: src/cms)
  --apply              Apply the managed patch even when not selected by default
  --packet-only        Only write the upgrade packet; do not change project files
  --allow-dirty        Allow applying on top of an uncommitted worktree
  --agent <name>       auto, none, claude, codex, or cursor (default: auto)
  --help               Show this help

Examples:
  pnpm cms:upgrade v0.11.0
  pnpm cms:upgrade --packet-only
  pnpm cms:upgrade v0.11.0 --agent none
`;

const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    allowDirty: false,
    agent: (process.env.KIDE_UPGRADE_AGENT as Args["agent"]) || "auto",
    help: false,
  };

  const takeValue = (index: number, flag: string) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--from") {
      args.fromRef = takeValue(i, arg);
      i += 1;
    } else if (arg.startsWith("--from=")) {
      args.fromRef = arg.slice("--from=".length);
    } else if (arg === "--repo") {
      args.repo = takeValue(i, arg);
      i += 1;
    } else if (arg.startsWith("--repo=")) {
      args.repo = arg.slice("--repo=".length);
    } else if (arg === "--core-path") {
      args.corePath = trimSlashes(takeValue(i, arg));
      i += 1;
    } else if (arg.startsWith("--core-path=")) {
      args.corePath = trimSlashes(arg.slice("--core-path=".length));
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--packet-only") {
      args.apply = false;
    } else if (arg === "--allow-dirty") {
      args.allowDirty = true;
    } else if (arg === "--agent") {
      args.agent = parseAgent(takeValue(i, arg));
      i += 1;
    } else if (arg.startsWith("--agent=")) {
      args.agent = parseAgent(arg.slice("--agent=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.targetRef) {
      args.targetRef = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return args;
};

const parseAgent = (value: string): Args["agent"] => {
  if (value === "auto" || value === "none" || value === "claude" || value === "codex" || value === "cursor") {
    return value;
  }
  throw new Error(`Unknown agent "${value}". Use auto, none, claude, codex, or cursor.`);
};

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

const run = (command: string, args: string[], options: { cwd?: string; input?: string } = {}) =>
  execFileSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 100,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

const tryRun = (command: string, args: string[], options: { cwd?: string } = {}) => {
  try {
    return { ok: true as const, stdout: run(command, args, options), stderr: "" };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return {
      ok: false as const,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
};

const readStamp = (cwd: string): VersionStamp | null => {
  const file = path.join(cwd, ".kide-version");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as VersionStamp;
  } catch (error) {
    throw new Error(`Could not parse .kide-version: ${(error as Error).message}`, { cause: error });
  }
};

const stripGitSuffix = (repo: string) => repo.replace(/\.git$/, "");

const resolveLatestTag = (repo: string) => {
  const output = run("git", ["ls-remote", "--tags", "--sort=-v:refname", repo, "v*"]);
  for (const line of output.split("\n")) {
    const match = line.match(/refs\/tags\/(v[0-9][^^\s]*)$/);
    if (match) return match[1];
  }
  throw new Error(`No v-prefixed release tags found in ${repo}. Pass a target tag explicitly.`);
};

const cloneUpstream = (repo: string) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "kide-upgrade-"));
  const repoDir = path.join(tempDir, "repo");
  run("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", repo, repoDir]);
  run("git", ["fetch", "--quiet", "--tags", "--force"], { cwd: repoDir });
  return { tempDir, repoDir };
};

const resolveCommit = (repoDir: string, ref: string) => {
  const result = tryRun("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repoDir });
  if (!result.ok || !result.stdout) {
    throw new Error(`Could not resolve "${ref}" in the upstream repository.`);
  }
  return result.stdout;
};

const listChangedFiles = (repoDir: string, fromCommit: string, toCommit: string) => {
  const output = run("git", ["diff", "--name-only", fromCommit, toCommit], { cwd: repoDir });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const diffForPaths = (repoDir: string, fromCommit: string, toCommit: string, files: string[]) => {
  if (files.length === 0) return "";
  return run("git", ["diff", "--binary", fromCommit, toCommit, "--", ...files], { cwd: repoDir });
};

const changedFilesJson = (repoDir: string, fromCommit: string, toCommit: string) => {
  const output = run("git", ["diff", "--name-status", fromCommit, toCommit], { cwd: repoDir });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...files] = line.split(/\s+/);
      return { status, files };
    });
};

const isManagedRuntimePath = (file: string, corePath: string) => {
  const managedPrefixes = [
    `${corePath}/admin`,
    `${corePath}/client`,
    `${corePath}/core`,
    `${corePath}/internals`,
    `${corePath}/middleware`,
    `${corePath}/routes`,
  ];

  const managedFiles = new Set(["src/styles/admin.css"]);
  return managedFiles.has(file) || managedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
};

const isCarefulPath = (file: string, corePath: string) => {
  const carefulFiles = new Set([
    "package.json",
    "pnpm-lock.yaml",
    "astro.config.mjs",
    "tsconfig.json",
    "drizzle.config.ts",
    "src/env.d.ts",
  ]);
  const carefulPrefixes = [`${corePath}/adapters`, `${corePath}/collections`, `${corePath}/migrations`];
  return (
    carefulFiles.has(file) ||
    file === `${corePath}/cms.config.ts` ||
    carefulPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))
  );
};

const relativeToCwd = (cwd: string, file: string) => path.relative(cwd, file) || ".";

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

const choosePacketDir = (cwd: string, fromRef: string, targetRef: string) => {
  const root = path.join(cwd, ".kide", "upgrade");
  mkdirSync(root, { recursive: true });
  const base = `${sanitizeId(fromRef)}-to-${sanitizeId(targetRef)}`;
  let candidate = path.join(root, base);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = path.join(root, `${base}-${suffix}`);
    suffix += 1;
  }
  mkdirSync(candidate, { recursive: true });
  return candidate;
};

const backupFiles = (cwd: string, packetDir: string, files: string[]) => {
  const backupDir = path.join(packetDir, "backup");
  mkdirSync(backupDir, { recursive: true });
  const backedUp: string[] = [];
  const missing: string[] = [];

  for (const file of files) {
    const source = path.join(cwd, file);
    if (!existsSync(source)) {
      missing.push(file);
      continue;
    }
    const stat = statSync(source);
    if (!stat.isFile()) continue;
    const destination = path.join(backupDir, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    backedUp.push(file);
  }

  writeFileSync(path.join(backupDir, "manifest.json"), `${JSON.stringify({ backedUp, missing }, null, 2)}\n`);
  return { backedUp, missing };
};

const isGitRepo = (cwd: string) => tryRun("git", ["rev-parse", "--is-inside-work-tree"], { cwd }).ok;

const gitStatus = (cwd: string) => {
  const result = tryRun("git", ["status", "--porcelain"], { cwd });
  return result.ok ? result.stdout : "";
};

const unmergedFiles = (cwd: string) => {
  const result = tryRun("git", ["diff", "--name-only", "--diff-filter=U"], { cwd });
  return result.ok
    ? result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
};

const detectAgents = () =>
  AGENTS.filter((agent) => {
    const result = spawnSync("which", [agent.command], { stdio: "ignore" });
    return result.status === 0;
  });

const selectAgent = (requested: Args["agent"], detected: AgentInfo[]) => {
  if (requested === "none") return null;
  if (requested === "auto") return detected[0] ?? null;
  return detected.find((agent) => agent.id === requested) ?? null;
};

const versionFromRef = (ref: string) => {
  const match = ref.match(/^v(\d+\.\d+\.\d+(?:[-+].*)?)$/);
  return match ? match[1] : null;
};

const writeReleaseNotes = (repoDir: string, fromCommit: string, toCommit: string, packetDir: string) => {
  const changelogDiff = tryRun("git", ["diff", fromCommit, toCommit, "--", "CHANGELOG.md"], { cwd: repoDir });
  const body = [
    "# Release Notes",
    "",
    `From: ${fromCommit}`,
    `To: ${toCommit}`,
    "",
    "## CHANGELOG diff",
    "",
    changelogDiff.ok && changelogDiff.stdout
      ? ["```diff", changelogDiff.stdout, "```"].join("\n")
      : "No CHANGELOG.md changes were found for this range.",
    "",
  ].join("\n");
  writeFileSync(path.join(packetDir, "release-notes.md"), body);
};

const renderPlan = (input: {
  repo: string;
  fromRef: string;
  targetRef: string;
  corePath: string;
  applyMode: string;
  managed: string[];
  careful: string[];
  other: string[];
}) =>
  [
    "# Kide Upgrade Plan",
    "",
    `Repository: ${input.repo}`,
    `From: ${input.fromRef}`,
    `To: ${input.targetRef}`,
    `Managed CMS path: ${input.corePath}`,
    `Apply mode: ${input.applyMode}`,
    "",
    "## What was prepared",
    "",
    "- `managed-runtime.patch` contains paths Kide can usually merge automatically.",
    "- `careful-review.patch` contains project-sensitive files such as package/config/collections/adapters.",
    "- `full-release.patch` contains the complete upstream diff for reference.",
    "- `backup/` contains copies of local files touched by the managed patch before it was applied.",
    "",
    "## Next steps",
    "",
    "1. If the managed patch applied cleanly, review the diff and continue with the careful-review patch only where it is relevant.",
    "2. If there are conflicts, resolve them by preserving local project intent and upstream runtime fixes.",
    "3. Review `package.json` and `pnpm-lock.yaml` changes from `careful-review.patch`; run `pnpm install` if dependencies changed.",
    "4. Run `pnpm cms:generate`, `pnpm check`, and `pnpm test`.",
    "5. Commit the upgrade together with the updated `.kide-version`.",
    "",
    "## Managed files",
    "",
    input.managed.length ? input.managed.map((file) => `- ${file}`).join("\n") : "None.",
    "",
    "## Careful-review files",
    "",
    input.careful.length ? input.careful.map((file) => `- ${file}`).join("\n") : "None.",
    "",
    "## Other upstream files",
    "",
    input.other.length ? input.other.map((file) => `- ${file}`).join("\n") : "None.",
    "",
  ].join("\n");

const renderAgentInstructions = (input: {
  fromRef: string;
  targetRef: string;
  packetRelative: string;
  applied: boolean;
  applyError: string | null;
}) =>
  [
    "# Agent Instructions: Kide Core Upgrade",
    "",
    `Upgrade this Kide client project from ${input.fromRef} to ${input.targetRef}.`,
    "",
    "The upgrade packet is in:",
    "",
    `  ${input.packetRelative}`,
    "",
    "Work from the packet, not from memory:",
    "",
    "1. Read `plan.md`, `conflicts.json`, and `release-notes.md`.",
    "2. Inspect `managed-runtime.patch` for runtime/admin/core changes.",
    "3. Inspect `careful-review.patch` for project-sensitive changes. Apply only the intent that belongs in this client.",
    "4. Preserve project-specific collections, adapters, migrations, public pages, and custom components unless an upstream change is clearly required.",
    "5. If conflict markers exist, resolve them directly in the project files.",
    "6. Keep `.kide-version` accurate. If the upgrade is complete, it should point at the target release.",
    "7. Run `pnpm cms:generate`, `pnpm check`, and `pnpm test`; explain any known baseline failures.",
    "",
    input.applied
      ? "The managed patch was already applied. Review and finish the careful parts."
      : input.applyError
        ? `The managed patch did not apply cleanly. Start by resolving the conflict/error recorded in \`conflicts.json\`: ${input.applyError}`
        : "The managed patch was not applied. Apply or merge it deliberately before finishing.",
    "",
  ].join("\n");

const renderReport = (input: {
  packetRelative: string;
  applied: boolean;
  applyError: string | null;
  selectedAgent: AgentInfo | null;
  detectedAgents: AgentInfo[];
  requestedAgent: Args["agent"];
}) => {
  const lines = [
    "# Kide Upgrade Report",
    "",
    `Packet: ${input.packetRelative}`,
    `Managed patch applied: ${input.applied ? "yes" : "no"}`,
  ];

  if (input.applyError) lines.push(`Apply error: ${input.applyError}`);
  lines.push("");

  if (input.selectedAgent) {
    lines.push(
      `Detected ${input.selectedAgent.label}. Give it \`${input.packetRelative}/agent-instructions.md\` to finish or review the upgrade.`,
    );
  } else if (input.requestedAgent !== "none" && input.detectedAgents.length === 0) {
    lines.push(
      "No local AI agent was detected.",
      "",
      "Nothing is blocked: the deterministic upgrade packet is ready. Resolve it manually, or paste `agent-instructions.md` into Claude, Codex, Cursor, or another coding agent later.",
    );
  } else if (input.requestedAgent !== "none") {
    lines.push(
      `Requested agent "${input.requestedAgent}" was not found locally.`,
      "",
      "The upgrade packet is still complete and can be handed to any agent or resolved manually.",
    );
  } else {
    lines.push("Agent handoff disabled with `--agent none`.");
  }

  lines.push("");
  return lines.join("\n");
};

async function main() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage);
    return;
  }

  const stamp = readStamp(cwd);
  const repo = args.repo ?? stamp?.template ?? DEFAULT_REPO;
  const corePath = args.corePath ?? stamp?.corePath ?? DEFAULT_CORE_PATH;
  const fromRef = args.fromRef ?? stamp?.ref ?? stamp?.commit ?? null;

  if (!fromRef) {
    throw new Error("No source ref found. Add .kide-version or pass --from <ref>.");
  }

  const targetRef = args.targetRef ?? resolveLatestTag(repo);
  if (fromRef === targetRef) {
    console.log(`[cms:upgrade] Already at ${targetRef}. Nothing to upgrade.`);
    return;
  }

  const gitAvailable = tryRun("git", ["--version"]).ok;
  if (!gitAvailable) throw new Error("git is required for Kide upgrades.");

  const projectIsGitRepo = isGitRepo(cwd);
  const dirtyBefore = projectIsGitRepo && gitStatus(cwd).length > 0;
  const shouldApply = args.apply ?? (projectIsGitRepo && !dirtyBefore);

  if (shouldApply && dirtyBefore && !args.allowDirty) {
    throw new Error(
      "The worktree has uncommitted changes. Commit/stash them first, or rerun with --packet-only or --allow-dirty --apply.",
    );
  }

  const { tempDir, repoDir } = cloneUpstream(repo);

  try {
    const fromCommit = resolveCommit(repoDir, fromRef);
    const toCommit = resolveCommit(repoDir, targetRef);
    const allChanged = listChangedFiles(repoDir, fromCommit, toCommit);
    const managed = allChanged.filter((file) => isManagedRuntimePath(file, corePath));
    const careful = allChanged.filter((file) => !managed.includes(file) && isCarefulPath(file, corePath));
    const other = allChanged.filter((file) => !managed.includes(file) && !careful.includes(file));

    const packetDir = choosePacketDir(cwd, fromRef, targetRef);
    const packetRelative = relativeToCwd(cwd, packetDir);
    const managedPatch = diffForPaths(repoDir, fromCommit, toCommit, managed);
    const carefulPatch = diffForPaths(repoDir, fromCommit, toCommit, careful);
    const fullPatch = diffForPaths(repoDir, fromCommit, toCommit, allChanged);

    writeFileSync(path.join(packetDir, "managed-runtime.patch"), managedPatch);
    writeFileSync(path.join(packetDir, "careful-review.patch"), carefulPatch);
    writeFileSync(path.join(packetDir, "full-release.patch"), fullPatch);
    writeFileSync(
      path.join(packetDir, "changed-files.json"),
      `${JSON.stringify(changedFilesJson(repoDir, fromCommit, toCommit), null, 2)}\n`,
    );
    writeReleaseNotes(repoDir, fromCommit, toCommit, packetDir);
    backupFiles(cwd, packetDir, [...managed, ".kide-version"]);

    let applied = false;
    let applyError: string | null = null;

    if (shouldApply && managedPatch.trim()) {
      const patchPath = path.join(packetDir, "managed-runtime.patch");
      const result = tryRun("git", ["apply", "--3way", relativeToCwd(cwd, patchPath)], { cwd });
      if (result.ok) {
        applied = true;
        const now = new Date().toISOString();
        const upgradeRecord: UpgradeRecord = {
          from: fromRef,
          to: targetRef,
          fromCommit,
          toCommit,
          at: now,
          packet: packetRelative,
          applied: true,
        };
        const nextStamp: VersionStamp = {
          ...(stamp ?? {}),
          template: stripGitSuffix(repo),
          ref: targetRef,
          commit: toCommit,
          kideVersion: versionFromRef(targetRef) ?? stamp?.kideVersion ?? null,
          corePath,
          upgradedAt: now,
          upgrades: [...(stamp?.upgrades ?? []), upgradeRecord],
        };
        writeFileSync(path.join(cwd, ".kide-version"), `${JSON.stringify(nextStamp, null, 2)}\n`);
      } else {
        applyError = result.stderr.trim() || result.stdout.trim() || "git apply --3way failed";
      }
    }

    const detectedAgents = detectAgents();
    const selectedAgent = selectAgent(args.agent, detectedAgents);
    const conflicts = {
      repo: stripGitSuffix(repo),
      fromRef,
      targetRef,
      fromCommit,
      toCommit,
      corePath,
      dirtyBefore,
      applied,
      applyError,
      unmergedFiles: projectIsGitRepo ? unmergedFiles(cwd) : [],
      changedFiles: { managed, careful, other },
      detectedAgents: detectedAgents.map(({ id, label, command }) => ({ id, label, command })),
      selectedAgent: selectedAgent
        ? { id: selectedAgent.id, label: selectedAgent.label, command: selectedAgent.command }
        : null,
    };

    writeFileSync(path.join(packetDir, "conflicts.json"), `${JSON.stringify(conflicts, null, 2)}\n`);
    writeFileSync(
      path.join(packetDir, "plan.md"),
      renderPlan({
        repo: stripGitSuffix(repo),
        fromRef,
        targetRef,
        corePath,
        applyMode: shouldApply ? "managed patch attempted" : "packet only",
        managed,
        careful,
        other,
      }),
    );
    writeFileSync(
      path.join(packetDir, "agent-instructions.md"),
      renderAgentInstructions({ fromRef, targetRef, packetRelative, applied, applyError }),
    );
    writeFileSync(
      path.join(packetDir, "report.md"),
      renderReport({ packetRelative, applied, applyError, selectedAgent, detectedAgents, requestedAgent: args.agent }),
    );
    writeFileSync(
      path.join(cwd, ".kide", "upgrade", "latest.json"),
      `${JSON.stringify({ packet: packetRelative, fromRef, targetRef, applied, createdAt: new Date().toISOString() }, null, 2)}\n`,
    );

    console.log(`[cms:upgrade] Packet ready: ${packetRelative}`);
    if (applied) {
      console.log(`[cms:upgrade] Applied managed runtime changes and updated .kide-version to ${targetRef}.`);
    } else if (applyError) {
      console.log("[cms:upgrade] Managed patch needs help. See conflicts.json and agent-instructions.md.");
    } else {
      console.log("[cms:upgrade] Packet-only mode. No project files were changed.");
    }

    if (selectedAgent) {
      console.log(
        `[cms:upgrade] Detected ${selectedAgent.label}. Handoff file: ${packetRelative}/agent-instructions.md`,
      );
    } else if (args.agent !== "none" && detectedAgents.length === 0) {
      console.log("[cms:upgrade] No local AI agent was detected.");
      console.log(
        `[cms:upgrade] Resolve manually or paste ${packetRelative}/agent-instructions.md into Claude, Codex, Cursor, or another agent.`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[cms:upgrade] ${(error as Error).message}`);
  process.exit(1);
});
