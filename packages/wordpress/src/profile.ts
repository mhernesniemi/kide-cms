/** Compact, agent-readable profile of the staged source: what exists, how often, and what it looks like. */
import { collectDomain, truncate } from "./domain";
import type { StagedMedia, StagedRecord } from "./staging";

export type PathStat = { path: string; records: number; sample: string };
export type TypeProfile = {
  type: string;
  records: number;
  statuses: Record<string, number>;
  locales: Record<string, number>;
  groups: number;
  /** Where the type's published URLs live (first segment after the locale), and how many go deeper than prefix + slug. */
  prefixes: Array<{ locale: string; prefix: string; records: number }>;
  nested: number;
  paths: PathStat[];
};

export const reusableLookup = (records: StagedRecord[]) => {
  const reusable = new Map(
    records.filter((r) => r.type === "wp_block").map((r) => [r.id, String(r.content ?? "")] as const),
  );
  return (ref: number) => reusable.get(ref);
};

export const buildProfile = (records: StagedRecord[]): TypeProfile[] => {
  const reusable = reusableLookup(records);
  const byType = new Map<string, StagedRecord[]>();
  for (const r of records) {
    const list = byType.get(r.type);
    if (list) list.push(r);
    else byType.set(r.type, [r]);
  }

  return [...byType.entries()].map(([type, list]) => {
    const stats = new Map<string, PathStat>();
    const statuses: Record<string, number> = {};
    const locales: Record<string, number> = {};
    for (const record of list) {
      statuses[record.status] = (statuses[record.status] ?? 0) + 1;
      if (record.locale) locales[record.locale] = (locales[record.locale] ?? 0) + 1;
      const seen = new Set<string>();
      collectDomain(record, reusable, (path, value) => {
        let stat = stats.get(path);
        if (!stat) stats.set(path, (stat = { path, records: 0, sample: truncate(value) }));
        if (!seen.has(path)) {
          seen.add(path);
          stat.records++;
        }
      });
    }
    return {
      type,
      records: list.length,
      statuses,
      locales,
      groups: new Set(list.map((r) => r.group).filter(Boolean)).size,
      ...urlShape(list),
      paths: [...stats.values()],
    };
  });
};

const urlShape = (list: StagedRecord[]) => {
  const prefixes = new Map<string, { locale: string; prefix: string; records: number }>();
  let nested = 0;
  for (const r of list) {
    if (typeof r.permalink !== "string" || !["publish", "private"].includes(r.status)) continue;
    const segments = r.permalink.split("/").filter(Boolean);
    const localePrefix = r.locale && segments[0] === r.locale ? `/${segments.shift()}` : "";
    if (segments.length > 2) nested++;
    const prefix = `${localePrefix}${segments.length > 1 ? `/${segments[0]}` : ""}/…`;
    const key = `${r.locale ?? ""}|${prefix}`;
    const entry = prefixes.get(key) ?? { locale: r.locale ?? "", prefix, records: 0 };
    entry.records++;
    prefixes.set(key, entry);
  }
  return { prefixes: [...prefixes.values()].sort((a, b) => b.records - a.records).slice(0, 12), nested };
};

const counts = (o: Record<string, number>) =>
  Object.entries(o)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

const cell = (s: string) => s.replace(/\|/g, "\\|");

export const renderProfile = (meta: Record<string, string | undefined>, types: TypeProfile[], media: StagedMedia[]) => {
  const lines = [
    "# Source profile",
    "",
    `Source: ${meta.source} · site ${meta.siteUrl || "?"} · table prefix \`${meta.prefix}\` · scouted ${meta.scoutedAt}`,
    `Media: ${media.length} attachments · uploads ${meta.uploadsDir ? `local \`${meta.uploadsDir}\`` : `download from ${meta.uploadsUrl}`}`,
    "",
    "Every path below must be mapped or dropped in `migration/*.map.ts` (`kide-wp plan` enforces it).",
    "Inspect real records with `kide-wp sample <type>`.",
    "",
    "| source type | records | statuses | locales |",
    "| --- | --- | --- | --- |",
    ...types.map((t) => `| \`${t.type}\` | ${t.records} | ${counts(t.statuses)} | ${counts(t.locales) || "—"} |`),
  ];
  for (const t of types) {
    const fields = t.paths.filter((p) => !p.path.startsWith("block:") && !p.path.startsWith("shortcode:"));
    const blocks = t.paths.filter((p) => p.path.startsWith("block:"));
    const shortcodes = t.paths.filter((p) => p.path.startsWith("shortcode:"));
    lines.push("", `## \`${t.type}\` — ${t.records} records${t.groups ? ` · ${t.groups} translation groups` : ""}`, "");
    if (t.prefixes.length)
      lines.push(
        `Published URLs: ${t.prefixes.map((p) => `\`${p.prefix}\` ${p.records}`).join(" · ")}${t.nested ? ` · ${t.nested} deeper than \`/<prefix>/<slug>\` (these URLs change in Kide)` : ""}`,
        "",
      );
    lines.push("| path | filled | sample |", "| --- | --- | --- |");
    for (const p of fields) lines.push(`| \`${p.path}\` | ${p.records}/${t.records} | ${cell(p.sample)} |`);
    if (blocks.length) {
      lines.push("", "Blocks:", "", "| path | in records | sample |", "| --- | --- | --- |");
      for (const p of blocks)
        lines.push(`| \`${p.path}\` | ${p.records} | ${cell(p.path.includes(".") ? p.sample : "")} |`);
    }
    if (shortcodes.length) {
      lines.push("", "Shortcodes:", "", ...shortcodes.map((p) => `- \`${p.path}\` in ${p.records} records`));
    }
  }
  return `${lines.join("\n")}\n`;
};
