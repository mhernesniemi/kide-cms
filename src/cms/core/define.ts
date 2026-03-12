export type CollectionLabels = {
  singular: string;
  plural: string;
};

export type DatabaseConfig = {
  dialect: "json-file" | "sqlite" | "postgres";
};

export type LocaleConfig = {
  default: string;
  supported: string[];
};

export type AdminFieldComponent = {
  component?: string;
  placeholder?: string;
  rows?: number;
  help?: string;
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
  admin?: AdminFieldComponent;
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

export type JsonFieldConfig = BaseFieldConfig<"json", Record<string, unknown>> & {
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

export type SeedTranslation = {
  locale: string;
  values: Record<string, unknown>;
};

export type SeedDocument = Record<string, unknown> & {
  _translations?: SeedTranslation[];
};

export type CollectionConfig = {
  slug: string;
  labels: CollectionLabels;
  pathPrefix?: string;
  timestamps?: boolean;
  drafts?: boolean;
  versions?: { max: number };
  auth?: boolean;
  fields: CollectionFieldMap;
  seed?: SeedDocument[];
};

export type CMSConfig = {
  database?: DatabaseConfig;
  storage?: {
    adapter?: "json-file";
    root?: string;
  };
  locales?: LocaleConfig;
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

export type CollectionAccess = Partial<Record<"read" | "create" | "update" | "delete" | "publish", AccessRule>>;

export type AccessConfig = Record<string, CollectionAccess>;

export type HookContext = {
  user?: AccessContext["user"];
  operation: string;
  collection: string;
  timestamp: string;
};

export type CollectionHooks = {
  beforeCreate?: (data: Record<string, unknown>, context: HookContext) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterCreate?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeUpdate?: (
    data: Record<string, unknown>,
    existing: Record<string, unknown>,
    context: HookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterUpdate?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforeDelete?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  afterDelete?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
  beforePublish?: (doc: Record<string, unknown>, context: HookContext) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterPublish?: (doc: Record<string, unknown>, context: HookContext) => void | Promise<void>;
};

export type HooksConfig = Record<string, CollectionHooks>;

const createField = <T extends FieldConfig>(type: T["type"], options?: Omit<T, "type">): T =>
  ({ type, ...(options ?? {}) }) as T;

export const fields = {
  text: (options?: Omit<TextFieldConfig, "type">) => createField<TextFieldConfig>("text", options),
  slug: (options?: Omit<SlugFieldConfig, "type">) => createField<SlugFieldConfig>("slug", options),
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

export const defineCollection = <T extends CollectionConfig>(collection: T): T => collection;

export const defineConfig = <T extends CMSConfig>(config: T): T => config;

export const defineAccess = <T extends AccessConfig>(config: T): T => config;

export const defineHooks = <T extends HooksConfig>(config: T): T => config;

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
