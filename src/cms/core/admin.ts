import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { richTextToPlainText } from "./values";

const DEFAULT_DATE_FORMAT = "en-US";

let dateLocale = DEFAULT_DATE_FORMAT;
let timeZone: string | undefined;

export const initDateFormat = (config: CMSConfig, nextTimeZone?: string) => {
  dateLocale = config.admin?.dateFormat ?? DEFAULT_DATE_FORMAT;
  timeZone = nextTimeZone;
};

export const formatDate = (value: unknown): string => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(dateLocale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
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

  if (field.type === "richText") {
    const text = richTextToPlainText(value as never);
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
