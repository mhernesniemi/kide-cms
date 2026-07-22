export type CollectionLabels = {
  singular: string;
  plural: string;
};

export type DatabaseConfig = {
  dialect: "sqlite" | "postgres";
  url?: string;
};

export type LocaleConfig = {
  default: string;
  supported: string[];
};

export type AdminFieldComponent = {
  component?: string;
  placeholder?: string;
  position?: "content" | "sidebar";
  rows?: number;
  help?: string;
  hidden?: boolean;
  /** Per-field colour palette for `fields.color()`; overrides the global `admin.colors`. */
  colors?: ColorOption[];
};

export type FieldCondition = {
  field: string;
  value: string | string[] | boolean;
};

type BaseFieldConfig<TType extends string, TValue = unknown> = {
  type: TType;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: TValue;
  indexed?: boolean;
  unique?: boolean;
  translatable?: boolean;
  condition?: FieldCondition;
  admin?: AdminFieldComponent;
  access?: {
    read?: (context: {
      user?: { id: string; role?: string; email?: string } | null;
      doc?: Record<string, unknown> | null;
      operation: string;
      collection: string;
    }) => boolean | Promise<boolean>;
    update?: (context: {
      user?: { id: string; role?: string; email?: string } | null;
      doc?: Record<string, unknown> | null;
      operation: string;
      collection: string;
    }) => boolean | Promise<boolean>;
  };
};

export type TextFieldConfig = BaseFieldConfig<"text", string> & {
  maxLength?: number;
};

export type SlugFieldConfig = BaseFieldConfig<"slug", string> & {
  from?: string;
};

export type EmailFieldConfig = BaseFieldConfig<"email", string>;
export type NumberFieldConfig = BaseFieldConfig<"number", number>;
export type BooleanFieldConfig = BaseFieldConfig<"boolean", boolean>;
export type DateFieldConfig = BaseFieldConfig<"date", string>;

export type SelectFieldConfig = BaseFieldConfig<"select", string> & {
  options: string[];
};

export type RichTextNode = {
  type: string;
  value?: string;
  level?: number;
  children?: RichTextNode[];
  [key: string]: unknown;
};

export type RichTextDocument = {
  type: "root";
  children: RichTextNode[];
};

export type RichTextFieldConfig = BaseFieldConfig<"richText", RichTextDocument>;
export type ImageFieldConfig = BaseFieldConfig<"image", string>;

/**
 * An embedded component block inside a `content` field. Shares the same shape as
 * a `blocks` entry but lives inline in the rich-text stream, identified by `blockType`.
 */
export type ContentBlockNode = {
  type: "block";
  blockType: string;
  fields: Record<string, unknown>;
  [key: string]: unknown;
};

export type ContentNode = RichTextNode | ContentBlockNode;

/**
 * Storage shape for a `content` field: a rich-text document whose children may
 * also include inline component blocks. Compatible with RichTextDocument — plain
 * rich-text renderers simply skip the `block` nodes.
 */
export type ContentDocument = {
  type: "root";
  children: ContentNode[];
};

export type ContentFieldConfig = BaseFieldConfig<"content", ContentDocument> & {
  /** Component block types that can be embedded inline, same shape as `blocks`. */
  blocks: Record<string, Record<string, FieldConfig>>;
  /**
   * Show a button that expands the editor into a distraction-free fullscreen
   * overlay (hides the sidemenu and every other field). Defaults to true; set
   * `false` to hide the button.
   */
  fullscreen?: boolean;
};

export type RelationFieldConfig = BaseFieldConfig<"relation", string | string[]> & {
  collection: string;
  hasMany?: boolean;
};

export type ArrayFieldConfig = BaseFieldConfig<"array", unknown[]> & {
  of: FieldConfig;
};

export type JsonFieldConfig = BaseFieldConfig<"json", unknown> & {
  schema?: string;
  /**
   * Typed repeater rows. When set together with `admin.component: "repeater"`,
   * the block editor renders each array item as these named sub-fields (text,
   * select, boolean, image, richText, …) instead of a flat string row. The
   * value is stored as an array of objects keyed by these field names.
   */
  itemFields?: Record<string, FieldConfig>;
};

export type BlocksFieldConfig = BaseFieldConfig<"blocks", Array<Record<string, unknown>>> & {
  types: Record<string, Record<string, FieldConfig>>;
  /** Allow this block field to insert shared section references. Defaults to true. */
  shared?: boolean;
};

export type FieldConfig =
  | TextFieldConfig
  | SlugFieldConfig
  | EmailFieldConfig
  | NumberFieldConfig
  | BooleanFieldConfig
  | DateFieldConfig
  | SelectFieldConfig
  | RichTextFieldConfig
  | ContentFieldConfig
  | ImageFieldConfig
  | RelationFieldConfig
  | ArrayFieldConfig
  | JsonFieldConfig
  | BlocksFieldConfig;

export type CollectionFieldMap = Record<string, FieldConfig>;
export type SeedDocument = Record<string, unknown>;

export type CollectionViewConfig = {
  list?: {
    columns?: string[];
    defaultSort?: { field: string; direction: "asc" | "desc" };
  };
};

export type CollectionAdminConfig = {
  /** Sidebar group label. Built-ins include Content, Library, and Team. */
  group?: string;
  /** Hide from the sidebar while keeping the collection available to APIs and relations. */
  sidebar?: boolean;
  /** Lucide icon name used in the sidebar. */
  icon?: string;
  /** Sort order inside the sidebar group. Lower values appear first. */
  weight?: number;
};

export type SearchableConfig = boolean | { fields: string[] };

export type CollectionConfig = {
  slug: string;
  labels: CollectionLabels;
  labelField?: string;
  pathPrefix?: string;
  preview?: boolean | string;
  timestamps?: boolean;
  drafts?: boolean;
  versions?: { max: number };
  auth?: boolean;
  singleton?: boolean;
  searchable?: SearchableConfig;
  access?: CollectionAccess;
  hooks?: CollectionHooks;
  fields: CollectionFieldMap;
  views?: CollectionViewConfig;
  admin?: CollectionAdminConfig;
  seed?: SeedDocument[];
};

export type AdminNavItem = {
  label: string;
  href: string;
  icon?: string;
  /** Sort order — lower values appear first (default: 0) */
  weight?: number;
};

export type WebhookEvent = "create" | "update" | "delete" | "publish" | "unpublish";

export type WebhookContext = {
  user?: { id: string; role?: string; email?: string } | null;
  event: WebhookEvent;
  collection: string;
  timestamp: string;
};

export type WebhookConfig = {
  /** Display name (shown in logs) */
  name: string;
  /** URL to POST to */
  url: string;
  /** Events that trigger this webhook */
  events: WebhookEvent[];
  /** Restrict to specific collections (omit for all) */
  collections?: string[];
  /** HTTP method (default: POST) */
  method?: "POST" | "PUT" | "PATCH";
  /** Custom headers */
  headers?: Record<string, string>;
  /** Transform the payload (default: { event, collection, doc, user, timestamp }) */
  payload?: (doc: Record<string, unknown>, context: WebhookContext) => any;
};

export type AdminUploadConfig = {
  /** Allowed MIME types (default: images, PDF, video) */
  allowedTypes?: string[];
  /** Max file size in bytes (default: 50 MB) */
  maxFileSize?: number;
};

export type AdminRateLimitConfig = {
  /** Max login attempts before blocking (default: 5) */
  maxAttempts?: number;
  /** Time window in milliseconds (default: 15 minutes) */
  windowMs?: number;
};

export type AdminAuthPasswordConfig = {
  /** Enable email/password sign-in. Default true. */
  enabled?: boolean;
  /** Enable forgot-password reset flow. Default true for local/better-auth providers. */
  forgotPassword?: boolean;
  /** Require or expose email verification in auth providers that support it. Default false. */
  emailVerification?: boolean;
};

export type AdminAuthMfaConfig = {
  /** Enable authenticator-app TOTP where supported by the auth provider. */
  totp?: boolean;
  /** Enable single-use recovery codes where supported by the auth provider. */
  backupCodes?: boolean;
  /** Enable passkey/WebAuthn sign-in where supported by the auth provider. */
  passkeys?: boolean;
};

export type AdminAuthSsoProviderConfig = {
  /** Stable provider id used in URLs, e.g. "azure" or "okta". */
  id: string;
  /** Human label shown on the login screen. */
  label: string;
  /** Protocol/backend used by the auth provider. */
  type: "oidc" | "saml" | "oauth" | "workos" | "custom";
  /** OIDC issuer/discovery URL, SAML entity ID, or broker-specific issuer. */
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  /** Optional explicit authorization URL for custom/broker flows. */
  authorizationUrl?: string;
  /** Optional callback URL override. Defaults to Kide's callback route. */
  callbackUrl?: string;
  scopes?: string[];
  /** Restrict JIT sign-in/provisioning to these email domains. */
  allowedDomains?: string[];
  /** Default Kide role for newly provisioned users. */
  role?: string;
  /** Provider-specific options passed through to the selected auth backend. */
  options?: Record<string, unknown>;
};

export type AdminCustomAuthProvider = {
  kind: "custom";
  getSession: (request: Request) => Promise<Record<string, unknown> | null>;
  loginUrl?: string;
  logoutUrl?: string;
};

export type AdminAuthConfig = {
  /**
   * Auth backend. "local" keeps Kide's built-in session/password flow.
   * "better-auth" is the batteries-included backend for MFA, passkeys, OIDC/SAML,
   * and forgot-password flows. "workos" and "custom" are escape hatches.
   */
  provider?: "local" | "better-auth" | "workos" | AdminCustomAuthProvider;
  password?: AdminAuthPasswordConfig;
  mfa?: AdminAuthMfaConfig;
  sso?: {
    providers?: AdminAuthSsoProviderConfig[];
  };
  workos?: {
    clientId?: string;
    apiKey?: string;
    organizationId?: string;
    defaultRole?: string;
  };
  /** Escape hatch for provider-specific options, e.g. raw Better Auth config. */
  advanced?: Record<string, unknown>;
};

/** A named colour offered by `fields.color()` pickers. */
export type ColorOption = { label: string; value: string };

export type AdminConfig = {
  /** BCP-47 locale for admin date/time display (e.g. "en-US", "en-GB", "fi-FI"). Default "en-US". */
  dateFormat?: string;
  /** IANA time zone for admin date/time display (e.g. "Europe/Helsinki"). Overrides the browser's zone. */
  timeZone?: string;
  /**
   * Overrides for how admin dates/times are rendered, merged over the defaults
   * (numeric date + 2-digit hour/minute). Use e.g. `{ hour12: false }` for 24-hour time,
   * `{ second: "2-digit" }` to show seconds, or `{ hour: undefined, minute: undefined }` for date-only.
   */
  dateTimeFormat?: Intl.DateTimeFormatOptions;
  /**
   * Explicit render pattern; when set it wins over `dateFormat`/`dateTimeFormat`.
   * Tokens: `yyyy yy MM M dd d HH H hh h mm m ss s a`. Wrap literal text in single
   * quotes, e.g. `"d.M.yyyy 'klo' HH:mm"` → `1.7.2026 klo 14:30`. `timeZone` still applies.
   */
  dateTimePattern?: string;
  nav?: AdminNavItem[];
  uploads?: AdminUploadConfig;
  rateLimit?: AdminRateLimitConfig;
  auth?: AdminAuthConfig;
  /** Webhooks fired on content events */
  webhooks?: WebhookConfig[];
  /** Predefined palette offered by every `fields.color()` picker. */
  colors?: ColorOption[];
};

export type ImagePreset = {
  /** Aspect ratio as "W/H" (e.g. "21/9"). Omit for width-only resizing (no crop). */
  aspect?: string;
  /** Candidate widths for srcset (should stay within the pipeline's allowed widths). */
  widths: number[];
  /** Output formats, most-preferred first. Defaults to ["avif", "webp"]. */
  formats?: Array<"webp" | "avif" | "jpeg" | "png">;
  /** Default `sizes` attribute for this rendition. */
  sizes?: string;
};

export type ImagesConfig = {
  /** Named renditions, merged over the built-in defaults in core/image.ts. */
  presets?: Record<string, ImagePreset>;
};

// A collection opts into collaboration by appearing in `collections` — either as a
// bare slug, or as an object that overrides the group defaults for that collection.
export type CollaborationCollection = string | { slug: string; requireApproval?: boolean };

export type CollaborationConfig = {
  // Default publish gate for the listed collections. When true, publishing a
  // draft-enabled document is blocked until its review is "approved" (approvers
  // bypass). A per-collection entry can override this.
  requireApproval?: boolean;
  // User roles allowed to approve / request changes. Defaults to ["admin"].
  approverRoles?: string[];
  // Which collections get editorial collaboration (review workflow, assignee,
  // comments, activity). Presence in this list is the on switch — a collection
  // absent from it has no review UI, list columns, or gate.
  collections?: CollaborationCollection[];
};

export type ResolvedCollaboration = { enabled: boolean; requireApproval: boolean };

// Resolve collaboration settings for a single collection: whether it's enabled,
// and whether publishing requires approval (per-collection override → group default).
export const resolveCollaboration = (config: CMSConfig, collectionSlug: string): ResolvedCollaboration => {
  const collab = config.collaboration;
  const entry = collab?.collections?.find((c) => (typeof c === "string" ? c : c.slug) === collectionSlug);
  if (!entry) return { enabled: false, requireApproval: false };
  const override = typeof entry === "object" ? entry.requireApproval : undefined;
  return { enabled: true, requireApproval: override ?? collab?.requireApproval ?? false };
};

// Whether a user role can approve content (approve / request changes) and bypass
// the publish gate. Defaults to admins only.
export const isApprover = (config: CMSConfig, role: string | null | undefined): boolean => {
  const roles = config.collaboration?.approverRoles ?? ["admin"];
  return !!role && roles.includes(role);
};

export type CMSConfig = {
  database?: DatabaseConfig;
  locales?: LocaleConfig;
  admin?: AdminConfig;
  images?: ImagesConfig;
  collaboration?: CollaborationConfig;
  collections: CollectionConfig[];
};

export type AccessContext = {
  user?: {
    id: string;
    role?: string;
    email?: string;
    [key: string]: unknown;
  } | null;
  doc?: Record<string, unknown> | null;
  operation: string;
  collection: string;
};

export type AccessRule = (context: AccessContext) => boolean | Promise<boolean>;

export type CollectionAccess = Partial<
  Record<"read" | "create" | "update" | "delete" | "publish" | "schedule", AccessRule>
>;

export const hasRole =
  (...roles: string[]): AccessRule =>
  ({ user }) =>
    !!user?.role && roles.includes(user.role);

export type HookContext = {
  user?: AccessContext["user"];
  operation: string;
  collection: string;
  timestamp: string;
  cache?: {
    invalidate: (opts: { tags: string[] }) => void;
  };
};

export type CollectionHooks = {
  beforeCreate?: (
    data: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterCreate?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeUpdate?: (
    data: Record<string, unknown>,
    existing: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterUpdate?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeDelete?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  afterDelete?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforePublish?: (
    doc: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterPublish?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeUnpublish?: (
    doc: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterUnpublish?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeSchedule?: (
    doc: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterSchedule?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
};

const createField = <T extends FieldConfig>(type: T["type"], options?: Omit<T, "type">): T =>
  ({ type, ...(options ?? {}) }) as T;

export const fields = {
  text: (options?: Omit<TextFieldConfig, "type">) => createField<TextFieldConfig>("text", options),
  slug: (options?: Omit<SlugFieldConfig, "type">) =>
    // Slugs default to unique: true since they're almost always used as URL identifiers.
    // Pass `unique: false` explicitly to opt out.
    createField<SlugFieldConfig>("slug", { unique: true, ...(options ?? {}) }),
  email: (options?: Omit<EmailFieldConfig, "type">) => createField<EmailFieldConfig>("email", options),
  number: (options?: Omit<NumberFieldConfig, "type">) => createField<NumberFieldConfig>("number", options),
  boolean: (options?: Omit<BooleanFieldConfig, "type">) => createField<BooleanFieldConfig>("boolean", options),
  date: (options?: Omit<DateFieldConfig, "type">) => createField<DateFieldConfig>("date", options),
  select: (options: Omit<SelectFieldConfig, "type">) => createField<SelectFieldConfig>("select", options),
  richText: (options?: Omit<RichTextFieldConfig, "type">) => createField<RichTextFieldConfig>("richText", options),
  content: (options: Omit<ContentFieldConfig, "type">) => createField<ContentFieldConfig>("content", options),
  image: (options?: Omit<ImageFieldConfig, "type">) => createField<ImageFieldConfig>("image", options),
  /**
   * A palette colour picker. Stored as a hex text string ('' = inherit). Editors choose
   * from `admin.colors` in cms.config.ts, or a per-field `colors` palette passed here.
   */
  color: (options?: Omit<TextFieldConfig, "type"> & { colors?: ColorOption[] }) => {
    const { colors, ...rest } = options ?? {};
    return createField<TextFieldConfig>("text", {
      ...rest,
      admin: { ...(rest.admin ?? {}), component: "color", ...(colors ? { colors } : {}) },
    });
  },
  /** A structured link control. Stored as JSON { type, url, label, newTab }. */
  link: (options?: Omit<JsonFieldConfig, "type">) =>
    createField<JsonFieldConfig>("json", {
      ...(options ?? {}),
      admin: { ...(options?.admin ?? {}), component: "link" },
    }),
  relation: (options: Omit<RelationFieldConfig, "type">) => createField<RelationFieldConfig>("relation", options),
  array: (options: Omit<ArrayFieldConfig, "type">) => createField<ArrayFieldConfig>("array", options),
  json: (options?: Omit<JsonFieldConfig, "type">) => createField<JsonFieldConfig>("json", options),
  blocks: (options: Omit<BlocksFieldConfig, "type">) => createField<BlocksFieldConfig>("blocks", options),
};

export const defineCollection = (collection: CollectionConfig): CollectionConfig => collection;
export const defineConfig = (config: CMSConfig): CMSConfig => config;

export type WithSiteOptions = {
  /** Field name added to the collection. Defaults to "site". */
  field?: string;
  /** Site collection slug. Defaults to "sites". */
  collection?: string;
  /** Whether every document must choose a site. Defaults to true. */
  required?: boolean;
  /** Override admin options for the injected relation field. */
  admin?: AdminFieldComponent;
};

export const withSite = (collection: CollectionConfig, options: WithSiteOptions = {}): CollectionConfig => {
  const fieldName = options.field ?? "site";

  if (collection.fields[fieldName]) {
    throw new Error(`withSite() cannot add "${fieldName}" to "${collection.slug}" because that field already exists.`);
  }

  return {
    ...collection,
    fields: {
      [fieldName]: fields.relation({
        collection: options.collection ?? "sites",
        required: options.required ?? true,
        admin: { position: "sidebar", ...(options.admin ?? {}) },
      }),
      ...collection.fields,
    },
  };
};

export const getCollectionMap = (config: CMSConfig) =>
  Object.fromEntries(config.collections.map((collection) => [collection.slug, collection]));

export const getDefaultLocale = (config: CMSConfig) => config.locales?.default ?? null;

export const getTranslatableFieldNames = (collection: CollectionConfig) =>
  Object.entries(collection.fields)
    .filter(([, field]) => field.translatable)
    .map(([name]) => name);

export const isStructuralField = (field: FieldConfig) =>
  ["number", "boolean", "relation", "image", "date"].includes(field.type);

export const getCollectionLabel = (collection: CollectionConfig) => collection.labels.plural;

export const getLabelField = (collection: CollectionConfig): string => {
  if (collection.labelField && collection.labelField in collection.fields) return collection.labelField;
  if ("title" in collection.fields) return "title";
  if ("name" in collection.fields) return "name";
  const firstTextField = Object.entries(collection.fields).find(([, field]) => field.type === "text");
  return firstTextField ? firstTextField[0] : Object.keys(collection.fields)[0];
};
