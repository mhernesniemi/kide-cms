import type { CMSConfig } from "@/cms/core";

type User = { id: string; role?: string; email?: string } | null | undefined;

export function canRead(config: CMSConfig, user: User, slug: string): boolean {
  const c = config.collections.find((col) => col.slug === slug);
  const rule = c?.access?.read;
  if (!rule) return true;
  // Access rules are synchronous in practice; cast to unwrap the boolean | Promise<boolean> return type.
  return rule({ user: user ?? null, doc: null, operation: "read", collection: slug }) as boolean;
}

export function canWrite(config: CMSConfig, user: User, slug: string): boolean {
  const c = config.collections.find((col) => col.slug === slug);
  const rule = c?.access?.create;
  if (!rule) return true;
  return rule({ user: user ?? null, doc: null, operation: "create", collection: slug }) as boolean;
}

export function isFieldHidden(
  collection: { slug: string; fields: Record<string, any> } | null,
  user: User,
  fieldName: string,
): boolean {
  if (!collection) return false;
  const field = collection.fields[fieldName];
  if (!field?.access?.read) return false;
  return !field.access.read({ user: user ?? null, doc: null, operation: "read", collection: collection.slug });
}

export function isFieldReadOnly(
  collection: { slug: string; fields: Record<string, any> } | null,
  user: User,
  fieldName: string,
): boolean {
  if (!collection) return false;
  const field = collection.fields[fieldName];
  if (!field?.access?.update) return false;
  return !field.access.update({ user: user ?? null, doc: null, operation: "update", collection: collection.slug });
}

export function getVisualStatus(d: Record<string, unknown>): string {
  const status = String(d._status ?? "draft");
  if (status === "scheduled") return "scheduled";
  if (status === "published" && d._published) return "changed";
  return status;
}

export function getFormAction(collectionSlug: string, documentId?: string): string {
  if (collectionSlug === "users" && !documentId) return "/api/cms/auth/invite";
  return documentId ? `/api/cms/${collectionSlug}/${documentId}` : `/api/cms/${collectionSlug}`;
}
