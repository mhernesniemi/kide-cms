import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { DEFAULT_DATE_SETTINGS, formatDateWith, type DateSettings } from "./date-format";
import { contentToPlainText, richTextToPlainText } from "./values";

let dateSettings: DateSettings = DEFAULT_DATE_SETTINGS;

export const initDateFormat = (config: CMSConfig, nextTimeZone?: string) => {
  dateSettings = {
    locale: config.admin?.dateFormat ?? DEFAULT_DATE_SETTINGS.locale,
    // A configured zone wins; otherwise fall back to the browser's zone (passed in per request).
    timeZone: config.admin?.timeZone ?? nextTimeZone,
    options: { ...DEFAULT_DATE_SETTINGS.options, ...config.admin?.dateTimeFormat },
    pattern: config.admin?.dateTimePattern,
  };
};

export const getDateSettings = (): DateSettings => dateSettings;

export const formatDate = (value: unknown): string => formatDateWith(value, dateSettings);


export type AdminRoute =
  | { kind: "dashboard" }
  | { kind: "recent" }
  | { kind: "needs-you" }
  | { kind: "singles" }
  | { kind: "list"; collectionSlug: string }
  | { kind: "new"; collectionSlug: string }
  | { kind: "edit"; collectionSlug: string; documentId: string };

export const resolveAdminRoute = (path: string | undefined): AdminRoute => {
  const segments = (path ?? "").split("/").filter(Boolean);

  if (segments.length === 0) return { kind: "dashboard" };
  if (segments[0] === "recent" && segments.length === 1) return { kind: "recent" };
  if (segments[0] === "needs-you" && segments.length === 1) return { kind: "needs-you" };
  if (segments[0] === "singles" && segments.length === 1) return { kind: "singles" };
  if (segments.length === 1) return { kind: "list", collectionSlug: segments[0] };
  if (segments[1] === "new") return { kind: "new", collectionSlug: segments[0] };

  return {
    kind: "edit",
    collectionSlug: segments[0],
    documentId: segments[1],
  };
};

/** Display text for a document's public URL in list tables — the bare root path reads as "Homepage" instead of "/". */
export const formatPagePath = (path: string | null | undefined) => (path === "/" ? "Homepage" : (path ?? "—"));

/** Link target for the URL column: live documents open the real page; never-published drafts only exist behind ?preview. */
export const getPageHref = (pagePath: string, isLive: boolean) => (isLive ? pagePath : `${pagePath}?preview=true`);

export const humanize = (value: string) =>
  value
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());

export const formatFieldValue = (
  field: FieldConfig | undefined,
  value: unknown,
  relationLabels: Record<string, string> = {},
) => {
  if (value === undefined || value === null || value === "") return "—";
  if (!field) return String(value);

  if (field.type === "richText" || field.type === "content") {
    const text = field.type === "content" ? contentToPlainText(value as never) : richTextToPlainText(value as never);
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  if (field.type === "array") {
    return Array.isArray(value) ? value.join(", ") : "—";
  }

  if (field.type === "json" || field.type === "blocks") {
    return Array.isArray(value) ? `${value.length} items` : "JSON";
  }

  if (field.type === "boolean") return value ? "Yes" : "No";

  if (field.type === "relation") {
    if (Array.isArray(value)) {
      return value.map((entry) => relationLabels[String(entry)] ?? String(entry)).join(", ");
    }
    return relationLabels[String(value)] ?? String(value);
  }

  return String(value);
};

export const getListColumns = (collection: CollectionConfig, viewConfig?: { columns?: string[] }) => {
  if (viewConfig?.columns?.length) {
    return collection.drafts ? viewConfig.columns : viewConfig.columns.filter((column) => column !== "_status");
  }
  const firstField = "title" in collection.fields ? "title" : Object.keys(collection.fields)[0];
  const columns = [firstField];
  if (collection.preview || collection.pathPrefix) columns.push("__page");
  if (collection.drafts) columns.push("_status");
  columns.push("_updatedAt");
  return columns;
};

/**
 * Partition an ordered field list into consecutive runs sharing the same
 * `admin.group` label. Runs with a group render as a titled panel in the edit
 * form (collapsible when any field in the run declares it); ungrouped runs
 * render as loose fields. Order is preserved, so grouping is purely
 * presentational and opt-in per field.
 */
export const getFieldGroups = (collection: CollectionConfig, fieldNames: string[]) => {
  const runs: Array<{ group?: string; collapsible?: boolean | "collapsed"; fields: string[] }> = [];
  for (const fieldName of fieldNames) {
    const raw = collection.fields[fieldName]?.admin?.group;
    const group = typeof raw === "object" ? raw.label : raw;
    const collapsible = typeof raw === "object" ? raw.collapsible : undefined;
    const last = runs[runs.length - 1];
    if (last && last.group === group) {
      last.fields.push(fieldName);
      last.collapsible ??= collapsible;
    } else {
      runs.push({ group, collapsible, fields: [fieldName] });
    }
  }
  return runs;
};

export const getFieldSets = (collection: CollectionConfig) => {
  const allFields = Object.keys(collection.fields).filter((fieldName) => !collection.fields[fieldName].admin?.hidden);
  const contentFields = allFields.filter((fieldName) => collection.fields[fieldName].admin?.position !== "sidebar");
  const sidebarFields = allFields.filter((fieldName) => collection.fields[fieldName].admin?.position === "sidebar");

  if (sidebarFields.length > 0) {
    return [
      { fields: contentFields, position: "content" as const },
      { fields: sidebarFields, position: "sidebar" as const },
    ];
  }

  return [{ fields: contentFields, position: "content" as const }];
};
