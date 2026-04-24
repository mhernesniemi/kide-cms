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

export type RelationFieldConfig = BaseFieldConfig<"relation", string | string[]> & {
  collection: string;
  hasMany?: boolean;
};

export type ArrayFieldConfig = BaseFieldConfig<"array", unknown[]> & {
  of: FieldConfig;
};

export type JsonFieldConfig = BaseFieldConfig<"json", unknown> & {
  schema?: string;
};

export type BlocksFieldConfig = BaseFieldConfig<"blocks", Array<Record<string, unknown>>> & {
  types: Record<string, Record<string, FieldConfig>>;
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

export type AdminConfig = {
  dateFormat?: string;
  nav?: AdminNavItem[];
  uploads?: AdminUploadConfig;
  rateLimit?: AdminRateLimitConfig;
  /** Webhooks fired on content events */
  webhooks?: WebhookConfig[];
};

export type CMSConfig = {
  database?: DatabaseConfig;
  locales?: LocaleConfig;
  admin?: AdminConfig;
  collections: CollectionConfig[];
};

export type AccessContext = {
  user?: {
    id: string;
    role?: string;
    email?: string;
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
  image: (options?: Omit<ImageFieldConfig, "type">) => createField<ImageFieldConfig>("image", options),
  relation: (options: Omit<RelationFieldConfig, "type">) => createField<RelationFieldConfig>("relation", options),
  array: (options: Omit<ArrayFieldConfig, "type">) => createField<ArrayFieldConfig>("array", options),
  json: (options?: Omit<JsonFieldConfig, "type">) => createField<JsonFieldConfig>("json", options),
  blocks: (options: Omit<BlocksFieldConfig, "type">) => createField<BlocksFieldConfig>("blocks", options),
};

export const defineCollection = (collection: CollectionConfig): CollectionConfig => collection;
export const defineConfig = (config: CMSConfig): CMSConfig => config;

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
