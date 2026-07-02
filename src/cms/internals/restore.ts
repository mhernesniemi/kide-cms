/**
 * `pnpm cms:restore [packet-dir]` - restore files from the latest Kide upgrade
 * backup, or from an explicit upgrade packet directory.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

type Args = {
  packetDir?: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
};

type FileCheckpoint = {
  exists: boolean;
  sha256?: string;
  size?: number;
};

type BackupEntry = {
  file: string;
  existed: boolean;
  backupSha256?: string;
  backupSize?: number;
  afterAttempt?: FileCheckpoint & { at?: string };
};

type BackupManifest = {
  backedUp?: string[];
  missing?: string[];
  entries?: BackupEntry[];
  [key: string]: unknown;
};

type PlanItem = {
  file: string;
  action: "restore" | "delete" | "skip" | "blocked";
  reason: string;
};

const usage = `Usage:
  pnpm cms:restore [upgrade-packet-dir]

Options:
  --dry-run       Show what would be restored without changing files
  --force         Restore even when files changed after the upgrade attempt
  --help          Show this help

Examples:
  pnpm cms:restore
  pnpm cms:restore --dry-run
  pnpm cms:restore .kide/upgrade/v0.10.0-to-v0.11.0
`;

const parseArgs = (argv: string[]): Args => {
  const args: Args = { dryRun: false, force: false, help: false };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!args.packetDir) {
      args.packetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return args;
};

const readJson = <T>(file: string): T => {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${(error as Error).message}`, { cause: error });
  }
};

const resolveInside = (root: string, file: string) => {
  if (path.isAbsolute(file)) throw new Error(`Refusing absolute restore path: ${file}`);
  const resolved = path.resolve(root, file);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing restore path outside ${root}: ${file}`);
  }
  return resolved;
};

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

const checkpoint = (file: string): FileCheckpoint => {
  if (!existsSync(file)) return { exists: false };
  const stat = statSync(file);
  if (!stat.isFile()) return { exists: true };
  return { exists: true, sha256: sha256(file), size: stat.size };
};

const sameCheckpoint = (actual: FileCheckpoint, expected?: FileCheckpoint) => {
  if (!expected) return false;
  if (!actual.exists || !expected.exists) return actual.exists === expected.exists;
  return actual.sha256 === expected.sha256 && actual.size === expected.size;
};

const resolvePacketDir = (cwd: string, packetArg?: string) => {
  if (packetArg) return path.resolve(cwd, packetArg);

  const latestPath = path.join(cwd, ".kide", "upgrade", "latest.json");
  if (!existsSync(latestPath)) {
    throw new Error("No latest upgrade packet found. Pass a packet directory explicitly.");
  }

  const latest = readJson<{ packet?: string }>(latestPath);
  if (!latest.packet) throw new Error(`${latestPath} does not include a packet path.`);
  return path.resolve(cwd, latest.packet);
};

const normalizeEntries = (manifest: BackupManifest): BackupEntry[] => {
  const byFile = new Map<string, BackupEntry>();

  for (const entry of manifest.entries ?? []) {
    byFile.set(entry.file, entry);
  }
  for (const file of manifest.backedUp ?? []) {
    if (!byFile.has(file)) byFile.set(file, { file, existed: true });
  }
  for (const file of manifest.missing ?? []) {
    if (!byFile.has(file)) byFile.set(file, { file, existed: false });
  }

  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
};

const planRestore = (cwd: string, backupDir: string, entries: BackupEntry[], force: boolean): PlanItem[] =>
  entries.map((entry) => {
    const target = resolveInside(cwd, entry.file);
    const current = checkpoint(target);

    if (entry.existed) {
      const backup = resolveInside(backupDir, entry.file);
      if (!existsSync(backup)) {
        return { file: entry.file, action: "blocked", reason: "backup file is missing" };
      }
      const backupState = checkpoint(backup);
      if (current.exists && sameCheckpoint(current, backupState)) {
        return { file: entry.file, action: "skip", reason: "already matches backup" };
      }
      if (force || sameCheckpoint(current, entry.afterAttempt)) {
        return { file: entry.file, action: "restore", reason: force ? "forced" : "matches upgrade attempt" };
      }
      return {
        file: entry.file,
        action: "blocked",
        reason: entry.afterAttempt ? "changed since upgrade attempt" : "no upgrade-attempt checkpoint",
      };
    }

    if (!current.exists) {
      return { file: entry.file, action: "skip", reason: "still absent" };
    }
    if (force || sameCheckpoint(current, entry.afterAttempt)) {
      return { file: entry.file, action: "delete", reason: force ? "forced" : "created by upgrade attempt" };
    }
    return {
      file: entry.file,
      action: "blocked",
      reason: entry.afterAttempt ? "changed since upgrade attempt" : "no upgrade-attempt checkpoint",
    };
  });

const writeReport = (packetDir: string, args: Args, plan: PlanItem[]) => {
  const byAction = (action: PlanItem["action"]) =>
    plan.filter((item) => item.action === action).map((item) => item.file);
  writeFileSync(
    path.join(packetDir, "restore-report.json"),
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        dryRun: args.dryRun,
        force: args.force,
        restored: byAction("restore"),
        deleted: byAction("delete"),
        skipped: byAction("skip"),
        blocked: plan.filter((item) => item.action === "blocked"),
      },
      null,
      2,
    )}\n`,
  );
};

async function main() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage);
    return;
  }

  const packetDir = resolvePacketDir(cwd, args.packetDir);
  const backupDir = path.join(packetDir, "backup");
  const manifestPath = path.join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No backup manifest found at ${manifestPath}.`);
  }

  const manifest = readJson<BackupManifest>(manifestPath);
  const entries = normalizeEntries(manifest);
  if (entries.length === 0) throw new Error(`No restorable files listed in ${manifestPath}.`);

  const plan = planRestore(cwd, backupDir, entries, args.force);
  const blocked = plan.filter((item) => item.action === "blocked");
  const restore = plan.filter((item) => item.action === "restore");
  const remove = plan.filter((item) => item.action === "delete");
  const skipped = plan.filter((item) => item.action === "skip");

  console.log(`[cms:restore] Packet: ${path.relative(cwd, packetDir) || "."}`);
  console.log(
    `[cms:restore] ${args.dryRun ? "Would restore" : "Restoring"} ${restore.length}, delete ${remove.length}, skip ${skipped.length}.`,
  );

  if (blocked.length > 0) {
    for (const item of blocked) {
      console.log(`[cms:restore] blocked ${item.file}: ${item.reason}`);
    }
    if (!args.dryRun) writeReport(packetDir, args, plan);
    throw new Error("Restore blocked. Re-run with --force to overwrite these files.");
  }

  if (!args.dryRun) {
    for (const item of restore) {
      const source = resolveInside(backupDir, item.file);
      const target = resolveInside(cwd, item.file);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
    for (const item of remove) {
      rmSync(resolveInside(cwd, item.file), { force: true });
    }
  }

  if (!args.dryRun) writeReport(packetDir, args, plan);
  console.log(args.dryRun ? "[cms:restore] Dry run complete." : "[cms:restore] Restore complete.");
}

main().catch((error) => {
  console.error(`[cms:restore] ${(error as Error).message}`);
  process.exit(1);
});
