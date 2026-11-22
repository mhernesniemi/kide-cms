/**
 * Mapping files (`migration/*.map.ts`) describe source → Kide as plain
 * functions. The engine runs them on proxied records and records every leaf the
 * mapping reads, so coverage is derived from what the code actually does — no
 * separate list of mapped fields to keep in sync.
 */
import type { ContentDocument, ContentNode, RichTextDocument, StoredLink } from "@kidecms/core";
import { decodeEntities } from "@kidecms/core";
import { htmlText } from "./domain";
import type { ShortcodeHandler } from "./gutenberg";
import type { StagedRecord } from "./staging";

export type SourceRecord = StagedRecord & Record<string, any>;

export type BlockInput = {
  name: string;
  attrs: Record<string, any>;
  /** ACF block fields with repeaters/flexible content nested (empty for non-ACF blocks). */
  data: Record<string, any>;
  innerHTML: string;
  /** Inner blocks rendered as Kide content nodes (same rules as `ctx.content`); rendered once. */
  inner: () => ContentNode[];
  /** Inner blocks as raw inputs (each with `.name`), for a parent built from its children (a carousel from its cards). */
  children: () => BlockInput[];
  /** The declared block's fields (default: the same-named block) filled by name, to spread and override in a handler. */
  auto: (blockType?: string) => Record<string, unknown>;
};

export type MapContext = {
  /**
   * Kide `_id` of the document a source post maps to (translations resolve to their group's
   * document). A record key such as `"form:4"` addresses other sources.
   */
  ref: (id: unknown, options?: { optional?: boolean }) => string | null;
  refs: (ids: unknown, options?: { optional?: boolean }) => string[];
  /** Kide `_id` of the document a source term maps to. */
  term: (id: unknown, options?: { optional?: boolean }) => string | null;
  /** Source post id → link field value referencing its Kide document (survives slug changes). */
  refLink: (id: unknown, options?: { optional?: boolean }) => StoredLink | null;
  /** Attachment id or uploads URL → image/file value (uploaded on apply, deduped by content hash). */
  media: (idOrUrl: unknown, options?: { optional?: boolean }) => string | null;
  /** Gutenberg/classic HTML → `content` value; blocks go through the mapping's `blocks` handlers. */
  content: (html: unknown) => ContentDocument;
  /** HTML → rich text (no inline blocks). */
  richText: (html: unknown) => RichTextDocument;
  /** HTML → plain text. */
  text: (html: unknown) => string;
  /** ACF link array or URL → link field value. Internal URLs become root-relative. */
  link: (value: unknown) => StoredLink | null;
  /** WP / ACF date → ISO date string. */
  date: (value: unknown) => string | null;
  /** Another staged record, untracked (for lookups such as menu targets). */
  record: (keyOrId: unknown) => SourceRecord | undefined;
  /** The `locale` member of a record's translation group (a key like `"term:12"`, or the record itself), untracked. */
  translation: (keyOrRecord: unknown, locale: string | undefined) => SourceRecord | undefined;
  /** Records of a type listed in the mapping's `includes`, tracked: their fields join this mapping's coverage. */
  records: (type: string, filter?: (record: SourceRecord) => boolean) => SourceRecord[];
  /**
   * Every field of the mapping's collection filled by name and declared type: title, slug (`home` for
   * the front page), the content body, featured image, excerpt, date, parent, terms, Yoast SEO, and
   * ACF meta of the same name (camelCase or snake_case). Spread it and override what differs.
   */
  auto: (src: SourceRecord) => Record<string, unknown>;
  /** A nav menu term → `menu-items` tree from its `nav_menu_item` records (needs `includes: ["nav_menu_item"]`). */
  menuItems: (menu: SourceRecord) => MenuItem[];
  /** A `taxonomy` record → `taxonomy-terms` tree in its locale (needs `includes: ["term:<taxonomy>"]`). */
  termTree: (taxonomy: SourceRecord, options?: { split?: boolean }) => TermNode[];
  /** A Gravity Forms `form` record → the fields of the `forms` preset collection. */
  form: (form: SourceRecord) => Record<string, unknown>;
  locale: string | undefined;
  warn: (message: string) => void;
};

export type MenuItem = { id: string; label: string; href: string; target?: "_blank"; children: MenuItem[] };
export type TermNode = { id: string; name: string; slug: string; children: TermNode[] };

export type BlockHandler = (
  block: BlockInput,
  ctx: MapContext,
) => ContentNode | ContentNode[] | string | null | undefined;

export type Mapping = {
  /** Source type: a WP post type (`page`, `post`, `case`) or `term:<taxonomy>`. */
  source: string;
  collection: string;
  /**
   * Return a reason string to leave a record out (counted in the ledger), or false. Several mappings
   * may share a `source` (posts split into collections by category): each record goes to the one
   * whose filter returns true, and `false` there means "not mine" rather than "filtered".
   */
  filter?: (src: SourceRecord) => boolean | string;
  /** Kide `_id` for the document. Defaults to `wp-<id>` / `wp-term-<id>`. */
  id?: (src: SourceRecord) => string;
  map: (src: SourceRecord, ctx: MapContext) => Record<string, unknown>;
  /**
   * Source types folded into this mapping's documents (menu items into menus, terms into a
   * taxonomy). Read them with `ctx.records(type)`; their paths are covered here as `<type>:<path>`.
   */
  includes?: string[];
  /** Paths deliberately not migrated → reason. Globs allowed: `meta.legacy_*`, `block:core/spacer`. */
  drop?: Record<string, string>;
  blocks?: Record<string, BlockHandler>;
  /** `"set"` when the mapping deliberately dedupes (term lists): each distinct source word must arrive, not every copy. */
  textMatch?: "multiset" | "set";
  /**
   * Shortcode name → handler (HTML, or content nodes such as a form block), or "keep" to leave it as
   * literal text (code samples, `[placeholder]` prose). `"*"` applies to all others.
   */
  shortcodes?: Record<string, ShortcodeHandler | "keep">;
};

export type Skip = { source: string; skip: string };
export type MappingModule = Mapping | Skip | Array<Mapping | Skip>;

export const defineMapping = (mapping: Mapping): Mapping => mapping;
export const skipSource = (source: string, reason: string): Skip => ({ source, skip: reason });

export const isSkip = (m: Mapping | Skip): m is Skip => "skip" in m;

// --- read tracking ------------------------------------------------------------

export class Tracker {
  readonly expected: string[] = [];
  private readonly strings = new Map<string, string>();
  private readonly consumed = new Set<string>();

  constructor(readonly reads: Set<string>) {}

  read(path: string, value: unknown) {
    this.reads.add(path);
    if (typeof value === "string" && /\S\s+\S/.test(value)) this.strings.set(value, path);
  }

  /** An HTML input handed to a ctx transform: its text is expected via `expect`, not as a raw read. */
  consume(value: unknown) {
    if (typeof value === "string") this.consumed.add(value);
  }

  expect(text: string) {
    if (text.trim()) this.expected.push(text);
  }

  expectedTexts(): string[] {
    const out = [...this.expected];
    for (const value of this.strings.keys()) {
      if (!this.consumed.has(value)) out.push(/<[a-z!]/i.test(value) ? htmlText(value) : decodeEntities(value));
    }
    return out;
  }
}

// `nav_menu_item:` is the root of an included record, so its fields read as `nav_menu_item:title`.
const childPath = (path: string, prop: string, isArray: boolean) =>
  isArray ? `${path}[]` : !path || path.endsWith(":") ? `${path}${prop}` : `${path}.${prop}`;

export const track = <T>(value: T, path: string, tracker: Tracker): T => {
  if (value === null || typeof value !== "object") return value;
  const isArray = Array.isArray(value);
  return new Proxy(value as object, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol" || typeof v === "function") return v;
      if (isArray && !/^\d+$/.test(prop)) return v;
      const p = childPath(path, prop, isArray);
      if (v !== null && typeof v === "object") return track(v, p, tracker);
      if (v !== undefined && v !== null && v !== "") tracker.read(p, v);
      return v;
    },
  }) as T;
};
