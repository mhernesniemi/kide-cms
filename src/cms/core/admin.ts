import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { contentToPlainText, richTextToPlainText } from "./values";

const DEFAULT_DATE_FORMAT = "en-US";
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

let dateLocale = DEFAULT_DATE_FORMAT;
let timeZone: string | undefined;
let formatOptions: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS;
let datePattern: string | undefined;

export const initDateFormat = (config: CMSConfig, nextTimeZone?: string) => {
  dateLocale = config.admin?.dateFormat ?? DEFAULT_DATE_FORMAT;
  // A configured zone wins; otherwise fall back to the browser's zone (passed in per request).
  timeZone = config.admin?.timeZone ?? nextTimeZone;
  formatOptions = { ...DEFAULT_DATE_OPTIONS, ...config.admin?.dateTimeFormat };
  datePattern = config.admin?.dateTimePattern;
};

// Extract zone-correct numeric parts once, then substitute pattern tokens against them.
type DateParts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

const zoneParts = (date: Date, zone: string | undefined): DateParts => {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return parts as unknown as DateParts;
};

const TOKEN_FNS: Record<string, (p: DateParts) => string> = {
  yyyy: (p) => p.year,
  yy: (p) => p.year.slice(-2),
  MM: (p) => p.month,
  M: (p) => String(Number(p.month)),
  dd: (p) => p.day,
  d: (p) => String(Number(p.day)),
  HH: (p) => p.hour,
  H: (p) => String(Number(p.hour)),
  hh: (p) => String(((Number(p.hour) + 11) % 12) + 1).padStart(2, "0"),
  h: (p) => String(((Number(p.hour) + 11) % 12) + 1),
  mm: (p) => p.minute,
  m: (p) => String(Number(p.minute)),
  ss: (p) => p.second,
  s: (p) => String(Number(p.second)),
  a: (p) => (Number(p.hour) < 12 ? "AM" : "PM"),
};

const TOKEN_RE = /'([^']*)'|yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|a/g;

const formatWithPattern = (date: Date, pattern: string, zone: string | undefined): string => {
  const p = zoneParts(date, zone);
  return pattern.replace(TOKEN_RE, (match, quoted?: string) => {
    if (quoted !== undefined) return quoted === "" ? "'" : quoted; // '' → literal apostrophe
    return TOKEN_FNS[match]?.(p) ?? match;
  });
};

export const formatDate = (value: unknown): string => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  if (datePattern) return formatWithPattern(date, datePattern, timeZone);
  return date.toLocaleString(dateLocale, { ...formatOptions, timeZone });
};

export type AdminRoute =
  | { kind: "dashboard" }
  | { kind: "recent" }
  | { kind: "singles" }
  | { kind: "list"; collectionSlug: string }
  | { kind: "new"; collectionSlug: string }
  | { kind: "edit"; collectionSlug: string; documentId: string };

export const resolveAdminRoute = (path: string | undefined): AdminRoute => {
  const segments = (path ?? "").split("/").filter(Boolean);

  if (segments.length === 0) return { kind: "dashboard" };
  if (segments[0] === "recent" && segments.length === 1) return { kind: "recent" };
  if (segments[0] === "singles" && segments.length === 1) return { kind: "singles" };
  if (segments.length === 1) return { kind: "list", collectionSlug: segments[0] };
  if (segments[1] === "new") return { kind: "new", collectionSlug: segments[0] };

  return {
    kind: "edit",
    collectionSlug: segments[0],
    documentId: segments[1],
  };
};

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
  return collection.drafts ? [firstField, "_status", "_updatedAt"] : [firstField, "_updatedAt"];
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
