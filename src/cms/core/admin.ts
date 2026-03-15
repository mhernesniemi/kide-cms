import type { CMSConfig, CollectionConfig, FieldConfig } from "./define";
import { richTextToPlainText } from "./values";

const DEFAULT_DATE_FORMAT = "en-US";

let _dateLocale: string = DEFAULT_DATE_FORMAT;

export const initDateFormat = (config: CMSConfig) => {
  _dateLocale = config.admin?.dateFormat ?? DEFAULT_DATE_FORMAT;
};

export const formatDate = (value: unknown): string => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(_dateLocale);
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

  if (segments.length === 0) {
    return { kind: "dashboard" };
  }

  if (segments[0] === "recent" && segments.length === 1) {
    return { kind: "recent" };
  }

  if (segments[0] === "singles" && segments.length === 1) {
    return { kind: "singles" };
  }

  if (segments.length === 1) {
    return { kind: "list", collectionSlug: segments[0] };
  }

  if (segments[1] === "new") {
    return { kind: "new", collectionSlug: segments[0] };
  }

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
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (!field) {
    return String(value);
  }

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

  if (field.type === "boolean") {
    return value ? "Yes" : "No";
  }

  if (field.type === "relation") {
    if (Array.isArray(value)) {
      return value.map((entry) => relationLabels[String(entry)] ?? String(entry)).join(", ");
    }

    return relationLabels[String(value)] ?? String(value);
  }

  return String(value);
};

export const getListColumns = (collection: CollectionConfig, viewConfig?: { columns?: string[] }) =>
  viewConfig?.columns?.length
    ? viewConfig.columns
    : ["title" in collection.fields ? "title" : Object.keys(collection.fields)[0], "_status", "_updatedAt"];

export const getFieldSets = (
  collection: CollectionConfig,
  viewConfig?: { layout?: Array<{ fields: string[]; width?: string }> },
) => {
  if (!viewConfig?.layout?.length) {
    const allFields = Object.keys(collection.fields);
    const sidebarTypes = new Set(["slug", "relation"]);
    const sidebarFields = allFields.filter((f) => sidebarTypes.has(collection.fields[f].type));
    const mainFields = allFields.filter((f) => !sidebarTypes.has(collection.fields[f].type));

    if (sidebarFields.length > 0) {
      return [
        { fields: mainFields, width: "full" },
        { fields: sidebarFields, width: "1/3" },
      ];
    }

    return [{ fields: allFields, width: "full" }];
  }

  const allFields = Object.keys(collection.fields);
  const listedFields = new Set(viewConfig.layout.flatMap((set) => set.fields));
  const unlisted = allFields.filter((f) => !listedFields.has(f));

  if (unlisted.length === 0) return viewConfig.layout;

  // Insert unlisted fields in config-defined order next to their nearest neighbor
  const layout = viewConfig.layout.map((set) => ({ ...set, fields: [...set.fields] }));

  for (const field of unlisted) {
    const configIndex = allFields.indexOf(field);

    // Walk backwards in config order to find the nearest preceding field that's already placed
    let inserted = false;
    for (let i = configIndex - 1; i >= 0; i--) {
      const prev = allFields[i];
      for (const set of layout) {
        const pos = set.fields.indexOf(prev);
        if (pos !== -1) {
          set.fields.splice(pos + 1, 0, field);
          inserted = true;
          break;
        }
      }
      if (inserted) break;
    }

    // No preceding neighbor found — insert before the nearest following field
    if (!inserted) {
      for (let i = configIndex + 1; i < allFields.length; i++) {
        const next = allFields[i];
        for (const set of layout) {
          const pos = set.fields.indexOf(next);
          if (pos !== -1) {
            set.fields.splice(pos, 0, field);
            inserted = true;
            break;
          }
        }
        if (inserted) break;
      }
    }

    // Fallback: add to first group
    if (!inserted) {
      layout[0].fields.push(field);
    }
  }

  return layout;
};
