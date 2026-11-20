import type { PlannedDoc, PlanResult, SourceLedger } from "./plan";
import type { Staging } from "./staging";

export const savePlan = (db: Staging, plan: PlanResult) => {
  db.transaction(() => {
    db.exec("DELETE FROM plan_docs; DELETE FROM plan_meta;");
    const insert = db.prepare(
      "INSERT OR REPLACE INTO plan_docs (doc_id, collection, source_keys, hash, data, translations, expected, media, text_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const d of plan.docs)
      insert.run(
        d.docId,
        d.collection,
        JSON.stringify(d.sourceKeys),
        d.hash,
        JSON.stringify(d.data),
        JSON.stringify(d.translations),
        JSON.stringify(d.expected),
        JSON.stringify(d.media),
        d.textMatch,
      );
    const meta = db.prepare("INSERT INTO plan_meta (key, value) VALUES (?, ?)");
    meta.run("createdAt", new Date().toISOString());
    meta.run("blocking", JSON.stringify(plan.blocking));
    meta.run("urlChanges", JSON.stringify(plan.urlChanges));
    meta.run(
      "media",
      JSON.stringify(Object.fromEntries([...plan.media].filter(([k]) => plan.docs.some((d) => d.media.includes(k))))),
    );
  })();
};

export const loadPlan = (db: Staging) => {
  const docs: PlannedDoc[] = (db.prepare("SELECT * FROM plan_docs ORDER BY collection, doc_id").all() as any[]).map(
    (r) => ({
      docId: r.doc_id,
      collection: r.collection,
      sourceKeys: JSON.parse(r.source_keys),
      hash: r.hash,
      data: JSON.parse(r.data),
      translations: JSON.parse(r.translations),
      expected: JSON.parse(r.expected),
      media: JSON.parse(r.media),
      textMatch: r.text_match === "set" ? "set" : "multiset",
    }),
  );
  const meta = Object.fromEntries(
    (db.prepare("SELECT key, value FROM plan_meta").all() as Array<{ key: string; value: string }>).map((r) => [
      r.key,
      r.value,
    ]),
  );
  if (!meta.createdAt) return null;
  return {
    docs,
    createdAt: meta.createdAt,
    blocking: JSON.parse(meta.blocking ?? "[]") as string[],
    urlChanges: JSON.parse(meta.urlChanges ?? "[]") as Array<{ key: string; from: string; to: string }>,
    media: JSON.parse(meta.media ?? "{}") as Record<
      string,
      { key: string; file: string | null; url: string; mime: string | null; alt: string | null }
    >,
  };
};

const cell = (s: string) => s.replace(/\|/g, "\\|");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const ledgerSection = (l: SourceLedger): string[] => {
  if (l.skip) return [`## \`${l.source}\` — skipped (${l.records} records): ${l.skip}`];
  const filtered = Object.entries(l.filtered)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
  const open = l.paths.filter((p) => p.status === "unaccounted");
  const lines = [
    `## \`${l.source}\` → \`${l.collection}\``,
    "",
    `${l.records} records → ${l.docs} documents${filtered ? ` · filtered: ${filtered}` : ""} · text recall min ${pct(l.recall.min)}, avg ${pct(l.recall.avg)}`,
    "",
  ];
  if (open.length) {
    lines.push(
      "**Unaccounted** — map these or add them to `drop` with a reason:",
      "",
      "| path | in records | sample |",
      "| --- | --- | --- |",
    );
    for (const p of open) lines.push(`| \`${p.path}\` | ${p.records} | ${cell(p.sample)} |`);
    lines.push("");
  }
  const byKind = new Map<string, typeof l.issues>();
  for (const i of l.issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  for (const [kind, issues] of byKind) {
    lines.push(`**${kind}** (${issues.length}):`, "");
    for (const i of issues.slice(0, 25)) lines.push(`- ${i.key ? `\`${i.key}\` ` : ""}${i.message}`);
    if (issues.length > 25) lines.push(`- … ${issues.length - 25} more`);
    lines.push("");
  }
  if (l.staleDrops.length)
    lines.push(`Stale drops (match nothing): ${l.staleDrops.map((d) => `\`${d}\``).join(", ")}`, "");
  const mapped = l.paths.filter((p) => p.status === "mapped").map((p) => `\`${p.path}\``);
  const dropped = l.paths.filter((p) => p.status === "dropped").map((p) => `\`${p.path}\` (${p.reason})`);
  lines.push(`Mapped (${mapped.length}): ${mapped.join(", ") || "—"}`, "");
  if (dropped.length) lines.push(`Dropped (${dropped.length}): ${dropped.join(", ")}`, "");
  return lines;
};

export const renderLedger = (plan: PlanResult): string => {
  const lines = [
    "# Import plan ledger",
    "",
    plan.blocking.length
      ? `**BLOCKED** — ${plan.blocking.length} problem(s). \`kide import apply\` refuses until they're fixed:`
      : `**READY** — every source path is mapped or dropped; ${plan.docs.length} documents planned.`,
    "",
    ...plan.blocking.map((b) => `- ${b}`),
    "",
  ];
  if (plan.unmapped.length)
    lines.push(
      "Unmapped source types (add a mapping or `skipSource(type, reason)`):",
      "",
      ...plan.unmapped.map((u) => `- \`${u.type}\` — ${u.records} records`),
      "",
    );
  for (const l of plan.ledgers) lines.push(...ledgerSection(l), "");
  return `${lines.join("\n")}\n`;
};
