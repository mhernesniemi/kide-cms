/**
 * `kide import verify`: read every planned document back through the CMS API and
 * reconcile it with the plan — present, every planned field still filled, media
 * resolved, translations stored, and the source text actually in the database.
 */
import { createCmsContext } from "../../internals/context";
import { isEmpty, outputStrings, textRecall } from "./domain";
import { MEDIA_PREFIX, normalizePath } from "./plan";
import { loadPlan } from "./report";
import { loadRecords, type Staging } from "./staging";

export type VerifyReport = {
  checked: number;
  ok: number;
  problems: Array<{ docId: string; collection: string; message: string }>;
  byCollection: Record<string, { planned: number; found: number; translations: number }>;
};

export const verifyImport = async (staging: Staging, options: { minRecall?: number } = {}): Promise<VerifyReport> => {
  const plan = loadPlan(staging);
  if (!plan) throw new Error("No plan yet — run `kide import plan` first.");
  const minRecall = options.minRecall ?? 0.95;
  const { cms, config, dispose } = await createCmsContext();
  const records = new Map(loadRecords(staging).map((r) => [r.key, r]));
  const changedTo = new Map(plan.urlChanges.map((c) => [c.key, c.to]));
  const defaultLocale = config.locales?.default;
  const api = cms as unknown as Record<string, any>;
  const report: VerifyReport = { checked: 0, ok: 0, problems: [], byCollection: {} };
  const ctx = { _system: true };

  try {
    for (const doc of plan.docs) {
      report.checked++;
      const stats = (report.byCollection[doc.collection] ??= { planned: 0, found: 0, translations: 0 });
      stats.planned++;
      const problem = (message: string) =>
        report.problems.push({ docId: doc.docId, collection: doc.collection, message });
      const before = report.problems.length;

      // Check what editors see and, for published documents, what the site serves (a stale live snapshot shows up there).
      const views: Array<[string, string]> = [["any", ""]];
      if (doc.data._status === "published") views.push(["published", "live: "]);
      let stored: Record<string, unknown> | null = null;
      let baseRow: Record<string, unknown> | null = null;
      for (const [status, label] of views) {
        const row = await api[doc.collection].findById(doc.docId, { status }, ctx);
        if (!row) {
          problem(`${label}missing in the CMS`);
          break;
        }
        baseRow ??= row;
        const fieldsOnly = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));
        stored ??= fieldsOnly;
        for (const [field, value] of Object.entries(doc.data)) {
          if (field.startsWith("_") || isEmpty(value)) continue;
          if (isEmpty(fieldsOnly[field])) problem(`${label}field "${field}" was planned but is empty in the CMS`);
        }
        if (JSON.stringify(fieldsOnly).includes(MEDIA_PREFIX)) problem(`${label}unresolved media placeholder stored`);
        const base = textRecall(doc.expected.base ?? [], outputStrings(fieldsOnly), doc.textMatch);
        if (base.recall < minRecall)
          problem(
            `${label}stored text recall ${(base.recall * 100).toFixed(1)}% (missing e.g. ${base.missing.join(", ")})`,
          );
      }
      if (!stored) continue;
      stats.found++;

      const locales = Object.keys(doc.translations);
      const translations: Record<string, Record<string, unknown>> = locales.length
        ? await api[doc.collection].getTranslations(doc.docId, ctx)
        : {};

      // The stored document must be served at its old WordPress URL, or at the URL the plan announced.
      if (api.meta.getCollection(doc.collection).fields.slug) {
        for (const key of doc.sourceKeys) {
          const record = records.get(key);
          if (typeof record?.permalink !== "string") continue;
          const locale = record.locale ?? defaultLocale;
          const slug =
            locale === baseRow?._sourceLocale ? baseRow?.slug : (translations[String(locale)]?.slug ?? baseRow?.slug);
          const route = api.meta.getRouteForDocument(doc.collection, { slug }, locale);
          const expected = changedTo.get(key) ?? normalizePath(record.permalink);
          if (route !== expected) problem(`${locale} route ${route} — expected ${expected}`);
        }
      }

      if (locales.length) {
        for (const locale of locales) {
          const overlay = translations[locale];
          if (!overlay) {
            problem(`translation ${locale} missing`);
            continue;
          }
          stats.translations++;
          const recall = textRecall(
            doc.expected[locale] ?? [],
            outputStrings({
              ...stored,
              ...Object.fromEntries(Object.entries(overlay).filter(([, v]) => v !== null && v !== undefined)),
            }),
            doc.textMatch,
          );
          if (recall.recall < minRecall)
            problem(
              `${locale} text recall ${(recall.recall * 100).toFixed(1)}% (missing e.g. ${recall.missing.join(", ")})`,
            );
        }
      }
      if (report.problems.length === before) report.ok++;
    }
  } finally {
    await dispose();
  }
  return report;
};
