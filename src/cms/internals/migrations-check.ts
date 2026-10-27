import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

// Diffs the generated schema against the latest committed snapshot. Any statement means a
// schema change has no migration yet (`pnpm db:generate` was forgotten).
export async function pendingMigrationStatements(schema: Record<string, unknown>, dir: string): Promise<string[]> {
  const journalPath = path.join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) throw new Error(`No migrations at ${dir}.`);
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
  const last = journal.entries.at(-1);
  if (!last) throw new Error(`Migration journal at ${journalPath} is empty.`);
  const snapshotPath = path.join(dir, "meta", `${String(last.idx).padStart(4, "0")}_snapshot.json`);
  const prev = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const cur = await generateSQLiteDrizzleJson({ ...schema });
  return generateSQLiteMigration(prev, cur);
}
