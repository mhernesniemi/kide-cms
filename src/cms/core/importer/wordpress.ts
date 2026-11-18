/**
 * WordPress source adapter: streams a mysqldump into the staging DB and builds
 * one clean record per post/term (ACF meta nested, Polylang/WPML locales and
 * translation groups resolved, attachments split out as media).
 */
import { readMysqlDump, type SqlValue } from "./mysql-dump";
import { nestAcf } from "./gutenberg";
import { maybeUnserialize } from "./php";
import { resetSource, setMeta, type Staging, type StagedRecord } from "./staging";

const KINDS = [
  "posts",
  "postmeta",
  "terms",
  "term_taxonomy",
  "term_relationships",
  "termmeta",
  "options",
  "icl_translations",
  "yoast_indexable",
  "gf_form",
  "gf_form_meta",
  "redirection_items",
] as const;
type Kind = (typeof KINDS)[number];
const TABLE = new RegExp(`^(.*?)(${KINDS.join("|")})$`);

const INTERNAL_POST_TYPES = new Set([
  "revision",
  "customize_changeset",
  "oembed_cache",
  "user_request",
  "custom_css",
  "wp_global_styles",
  "wp_template",
  "wp_template_part",
  "wp_font_family",
  "wp_font_face",
  "acf-field",
  "acf-field-group",
  "acf-taxonomy",
  "acf-post-type",
  "acf-ui-options-page",
  "scheduled-action",
]);
const SKIPPED_STATUSES = new Set(["auto-draft", "trash", "inherit"]);
const LOCALE_TAXONOMIES = new Set(["language", "post_translations", "term_language", "term_translations"]);
const INTERNAL_TAXONOMIES = new Set([
  ...LOCALE_TAXONOMIES,
  "post_format",
  "wp_theme",
  "wp_template_part_area",
  "wp_pattern_category",
  "link_category",
]);
const INTERNAL_META =
  /^(_edit_lock|_edit_last|_wp_old_slug|_wp_old_date|_encloseme|_pingme|_wp_trash_.*|_wp_desired_post_slug|_oembed_.*|_wp_attachment_metadata|_wp_attached_file|_wp_attachment_image_alt|_dp_original|_pll_.*|_wpml_.*|_icl_.*)$/;

export type ScoutOptions = { prefix?: string; uploadsDir?: string; mediaBaseUrl?: string; siteUrl?: string };

export type ScoutSummary = {
  prefix: string;
  siteUrl: string;
  records: number;
  media: number;
  types: Record<string, number>;
};

const isoDate = (gmt: unknown, local: unknown): string | null => {
  const pick = typeof gmt === "string" && !gmt.startsWith("0000") ? `${gmt.replace(" ", "T")}Z` : local;
  if (typeof pick !== "string" || pick.startsWith("0000")) return null;
  return pick.includes("T") ? pick : pick.replace(" ", "T");
};

// Per prefix: plugin tables like `wp_pmxe_posts` also end in a WP table name but have their own columns.
const rawTable = (prefix: string, kind: string) => `raw_${prefix.replace(/[^a-zA-Z0-9]/g, "_")}_${kind}`;

// WordPress stores non-ASCII slugs percent-encoded, sometimes in decomposed Unicode.
const decodeSlug = (raw: unknown) => {
  const s = String(raw ?? "");
  try {
    return decodeURIComponent(s).normalize("NFC");
  } catch {
    return s;
  }
};

const nonZero = (v: unknown) => (v === 0 || v === "0" || v === "" || v == null ? null : Number(v));

export const scoutWordPress = async (
  db: Staging,
  dumpFile: string,
  options: ScoutOptions = {},
): Promise<ScoutSummary> => {
  resetSource(db);
  const created = new Set<string>();
  const postCounts = new Map<string, number>();

  for await (const batch of readMysqlDump(dumpFile, (t) => TABLE.test(t))) {
    const [, prefix, kind] = TABLE.exec(batch.table)!;
    if (options.prefix && prefix !== options.prefix) continue;
    if (!batch.columns.length || !batch.rows.length) continue;
    const table = rawTable(prefix, kind);
    if (!created.has(table)) {
      db.exec(`CREATE TABLE IF NOT EXISTS ${table} (prefix TEXT, ${batch.columns.map((c) => `"${c}"`).join(", ")})`);
      created.add(table);
    }
    const insert = db.prepare(
      `INSERT INTO ${table} (prefix, ${batch.columns.map((c) => `"${c}"`).join(", ")}) VALUES (?, ${batch.columns.map(() => "?").join(", ")})`,
    );
    db.transaction((rows: SqlValue[][]) => {
      for (const row of rows) insert.run(prefix, ...row);
    })(batch.rows);
    if (kind === "posts") postCounts.set(prefix, (postCounts.get(prefix) ?? 0) + batch.rows.length);
  }

  const prefix = options.prefix ?? [...postCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (prefix === undefined) throw new Error(`No WordPress posts table found in ${dumpFile}.`);
  const has = (kind: Kind) => created.has(rawTable(prefix, kind));
  const all = <T = Record<string, any>>(kind: Kind, where = "", ...params: unknown[]): T[] =>
    has(kind)
      ? (db.prepare(`SELECT * FROM ${rawTable(prefix, kind)} WHERE prefix = ? ${where}`).all(prefix, ...params) as T[])
      : [];

  const options_ = Object.fromEntries(
    all(
      "options",
      "AND option_name IN ('siteurl','home','upload_path','upload_url_path','page_on_front','show_on_front','polylang')",
    ).map((o) => [o.option_name, String(o.option_value ?? "")]),
  );
  const siteUrl = (options.siteUrl || options_.home || options_.siteurl || "").replace(/\/$/, "");
  const uploadPath =
    options_.upload_path && !options_.upload_path.startsWith("/") ? options_.upload_path : "wp-content/uploads";
  const uploadsUrl = (options.mediaBaseUrl || options_.upload_url_path || `${siteUrl}/${uploadPath}`).replace(
    /\/$/,
    "",
  );

  // --- terms ---------------------------------------------------------------
  const terms = new Map(all("terms").map((t) => [Number(t.term_id), t]));
  const taxonomies = all("term_taxonomy");
  const ttById = new Map(taxonomies.map((tt) => [Number(tt.term_taxonomy_id), tt]));
  const termMeta = new Map<number, Record<string, unknown>>();
  for (const m of all("termmeta")) {
    const bucket = termMeta.get(Number(m.term_id)) ?? {};
    bucket[m.meta_key] = maybeUnserialize(m.meta_value);
    termMeta.set(Number(m.term_id), bucket);
  }

  const postLocale = new Map<number, string>();
  const postGroup = new Map<number, string>();
  const termLocale = new Map<number, string>();
  const termGroup = new Map<number, string>();
  const postTerms = new Map<number, Record<string, Array<{ id: number; slug: string; name: string }>>>();

  for (const rel of all("term_relationships")) {
    const tt = ttById.get(Number(rel.term_taxonomy_id));
    if (!tt) continue;
    const term = terms.get(Number(tt.term_id));
    const objectId = Number(rel.object_id);
    if (tt.taxonomy === "language" && term) postLocale.set(objectId, String(term.slug));
    else if (tt.taxonomy === "post_translations") postGroup.set(objectId, `pll:${tt.term_taxonomy_id}`);
    else if (tt.taxonomy === "term_language" && term) termLocale.set(objectId, String(term.slug).replace(/^pll_/, ""));
    else if (tt.taxonomy === "term_translations") termGroup.set(objectId, `pll-term:${tt.term_taxonomy_id}`);
    else if (!INTERNAL_TAXONOMIES.has(tt.taxonomy) && term) {
      const bucket = postTerms.get(objectId) ?? {};
      (bucket[tt.taxonomy] ??= []).push({ id: Number(term.term_id), slug: String(term.slug), name: String(term.name) });
      postTerms.set(objectId, bucket);
    }
  }
  for (const row of all("icl_translations")) {
    const type = String(row.element_type ?? "");
    const id = Number(row.element_id);
    if (type.startsWith("post_")) {
      postLocale.set(id, String(row.language_code));
      postGroup.set(id, `wpml:${row.trid}`);
    } else if (type.startsWith("tax_")) {
      const tt = ttById.get(id);
      if (tt) {
        termLocale.set(Number(tt.term_id), String(row.language_code));
        termGroup.set(Number(tt.term_id), `wpml:${row.trid}`);
      }
    }
  }

  // --- permalinks (Yoast indexables are the URLs WordPress actually serves) --------
  const toPath = (url: unknown) => {
    if (typeof url !== "string" || !url) return null;
    try {
      return decodeURI(new URL(url, "https://x.invalid").pathname);
    } catch {
      return null;
    }
  };
  const postPermalink = new Map<number, string>();
  const termPermalink = new Map<number, string>();
  for (const row of all("yoast_indexable")) {
    const p = toPath(row.permalink);
    if (!p || row.object_id == null) continue;
    if (row.object_type === "post") postPermalink.set(Number(row.object_id), p);
    else if (row.object_type === "term") termPermalink.set(Number(row.object_id), p);
  }

  // --- Polylang menu locations: one menu per location, translated per language -----
  const polylang = maybeUnserialize(options_.polylang) as Record<string, any> | string | undefined;
  const menuLocation = new Map<number, { location: string; locale?: string; group?: string }>();
  const navMenus = typeof polylang === "object" && polylang ? polylang.nav_menus : undefined;
  for (const locations of Object.values((navMenus ?? {}) as Record<string, Record<string, Record<string, number>>>)) {
    for (const [location, byLang] of Object.entries(locations ?? {})) {
      const ids = new Set(Object.values(byLang ?? {}).map(Number));
      for (const [lang, menuId] of Object.entries(byLang ?? {})) {
        if (menuLocation.has(Number(menuId))) continue;
        menuLocation.set(
          Number(menuId),
          ids.size > 1 ? { location, locale: lang, group: `menu:${location}` } : { location },
        );
      }
    }
  }

  // --- posts + meta ----------------------------------------------------------
  const posts = all("posts");
  const metaByPost = new Map<number, Record<string, unknown>>();
  for (const m of all("postmeta")) {
    const bucket = metaByPost.get(Number(m.post_id)) ?? {};
    bucket[m.meta_key] = maybeUnserialize(m.meta_value);
    metaByPost.set(Number(m.post_id), bucket);
  }

  const insertRecord = db.prepare("INSERT OR REPLACE INTO records (key, type, data) VALUES (?, ?, ?)");
  const insertMedia = db.prepare(
    "INSERT OR REPLACE INTO media (key, attachment_id, file, url, mime, alt) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const types: Record<string, number> = {};
  let mediaCount = 0;

  db.transaction(() => {
    for (const p of posts) {
      const id = Number(p.ID);
      const meta = metaByPost.get(id) ?? {};
      if (p.post_type === "attachment") {
        const file = typeof meta._wp_attached_file === "string" ? meta._wp_attached_file : null;
        const url = file ? `${uploadsUrl}/${file}` : String(p.guid ?? "");
        insertMedia.run(
          `att:${id}`,
          id,
          file,
          url,
          p.post_mime_type || null,
          (meta._wp_attachment_image_alt as string) || null,
        );
        mediaCount++;
        continue;
      }
      if (INTERNAL_POST_TYPES.has(p.post_type) || SKIPPED_STATUSES.has(p.post_status)) continue;

      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(meta)) if (!INTERNAL_META.test(k)) cleaned[k] = v;
      const { _thumbnail_id, _wp_page_template, ...rest } = cleaned;
      const record: StagedRecord = {
        key: `post:${id}`,
        type: String(p.post_type),
        id,
        status: String(p.post_status),
        locale: postLocale.get(id),
        group: postGroup.get(id),
        title: p.post_title ?? "",
        slug: decodeSlug(p.post_name),
        content: p.post_content ?? "",
        excerpt: p.post_excerpt ?? "",
        date: isoDate(p.post_date_gmt, p.post_date),
        modified: isoDate(p.post_modified_gmt, p.post_modified),
        parent: nonZero(p.post_parent),
        menuOrder: nonZero(p.menu_order),
        author: nonZero(p.post_author),
        template: _wp_page_template && _wp_page_template !== "default" ? _wp_page_template : null,
        featuredImage: nonZero(_thumbnail_id),
        terms: postTerms.get(id) ?? {},
        meta: nestAcf(rest),
        permalink: postPermalink.get(id) ?? null,
      };
      insertRecord.run(record.key, record.type, JSON.stringify(record));
      types[record.type] = (types[record.type] ?? 0) + 1;
    }

    for (const tt of taxonomies) {
      if (INTERNAL_TAXONOMIES.has(tt.taxonomy)) continue;
      const term = terms.get(Number(tt.term_id));
      if (!term) continue;
      const id = Number(term.term_id);
      const menu = tt.taxonomy === "nav_menu" ? menuLocation.get(id) : undefined;
      const record: StagedRecord = {
        key: `term:${id}`,
        type: `term:${tt.taxonomy}`,
        id,
        status: "publish",
        locale: menu ? menu.locale : termLocale.get(id),
        group: menu ? menu.group : termGroup.get(id),
        ...(tt.taxonomy === "nav_menu" ? { location: menu?.location ?? null } : {}),
        permalink: termPermalink.get(id) ?? null,
        name: term.name ?? "",
        slug: term.slug ?? "",
        description: tt.description ?? "",
        parent: nonZero(tt.parent),
        meta: nestAcf(termMeta.get(id) ?? {}),
      };
      insertRecord.run(record.key, record.type, JSON.stringify(record));
      types[record.type] = (types[record.type] ?? 0) + 1;
    }

    // One record per taxonomy and locale, so a whole term tree maps to one Kide `taxonomies` document.
    const taxonomyLocales = new Map<string, Set<string | undefined>>();
    for (const tt of taxonomies) {
      if (INTERNAL_TAXONOMIES.has(tt.taxonomy) || tt.taxonomy === "nav_menu") continue;
      const set = taxonomyLocales.get(tt.taxonomy) ?? new Set();
      set.add(termLocale.get(Number(tt.term_id)));
      taxonomyLocales.set(tt.taxonomy, set);
    }
    let syntheticId = 0;
    for (const [taxonomy, locales] of taxonomyLocales) {
      for (const locale of locales) {
        const record: StagedRecord = {
          key: `taxonomy:${taxonomy}${locale ? `:${locale}` : ""}`,
          type: "taxonomy",
          id: ++syntheticId,
          status: "publish",
          locale,
          group: locale ? `taxonomy:${taxonomy}` : undefined,
          taxonomy,
        };
        insertRecord.run(record.key, record.type, JSON.stringify(record));
        types.taxonomy = (types.taxonomy ?? 0) + 1;
      }
    }

    // Gravity Forms definitions, curated to what a form needs (entries are personal data and never staged).
    const formMeta = new Map(all("gf_form_meta").map((m) => [Number(m.form_id), m]));
    for (const form of all("gf_form")) {
      if (Number(form.is_trash)) continue;
      const meta = formMeta.get(Number(form.id));
      const parse = (raw: unknown) => {
        try {
          return typeof raw === "string" ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      };
      const display = parse(meta?.display_meta);
      const confirmations = Object.values(parse(meta?.confirmations) as Record<string, any>);
      const confirmation = confirmations.find((c) => c?.isDefault) ?? confirmations[0];
      const notification = Object.values(parse(meta?.notifications) as Record<string, any>).find(
        (n) => n?.isActive !== false && n?.toType === "email" && typeof n?.to === "string",
      );
      const record: StagedRecord = {
        key: `form:${form.id}`,
        type: "form",
        id: Number(form.id),
        status: Number(form.is_active) ? "publish" : "draft",
        title: String(form.title ?? ""),
        description: display.description ?? "",
        button: display.button?.text ?? "",
        fields: (Array.isArray(display.fields) ? display.fields : []).map((f: any) => ({
          id: f.id,
          type: f.type,
          label: f.label ?? "",
          adminLabel: f.adminLabel ?? "",
          isRequired: !!f.isRequired,
          placeholder: f.placeholder ?? "",
          description: f.description ?? "",
          content: f.content ?? "",
          maxLength: f.maxLength ?? "",
          checkboxLabel: f.checkboxLabel ?? "",
          choices: Array.isArray(f.choices)
            ? f.choices.map((c: any) => ({ text: c.text ?? "", value: c.value ?? "" }))
            : [],
          inputs: Array.isArray(f.inputs)
            ? f.inputs.filter((i: any) => !i.isHidden).map((i: any) => ({ id: i.id, label: i.label ?? "" }))
            : [],
        })),
        confirmation: confirmation
          ? {
              type: confirmation.type ?? "message",
              message: confirmation.message ?? "",
              url: confirmation.url ?? "",
              pageId: nonZero(confirmation.pageId),
            }
          : {},
        notifyEmail: notification?.to ?? "",
      };
      insertRecord.run(record.key, record.type, JSON.stringify(record));
      types.form = (types.form ?? 0) + 1;
    }

    // Redirection plugin rules.
    for (const r of all("redirection_items")) {
      if (r.action_type !== "url") continue;
      const record: StagedRecord = {
        key: `redirect:${r.id}`,
        type: "redirect",
        id: Number(r.id),
        status: r.status === "enabled" ? "publish" : "draft",
        from: String(r.url ?? ""),
        to: String(r.action_data ?? ""),
        code: Number(r.action_code) || 301,
        regex: !!Number(r.regex),
        hits: Number(r.last_count) || null,
      };
      insertRecord.run(record.key, record.type, JSON.stringify(record));
      types.redirect = (types.redirect ?? 0) + 1;
    }
  })();

  // The front page (and its translations) is the Kide `home` route.
  const frontId = options_.show_on_front === "page" ? Number(options_.page_on_front) : 0;
  if (frontId) {
    const frontGroup = postGroup.get(frontId);
    const members = [...postGroup.entries()].filter(([, g]) => frontGroup && g === frontGroup).map(([id]) => id);
    for (const id of new Set([frontId, ...members])) {
      const row = db.prepare("SELECT data FROM records WHERE key = ?").get(`post:${id}`) as
        { data: string } | undefined;
      if (!row) continue;
      const data = JSON.parse(row.data);
      data.frontPage = true;
      db.prepare("UPDATE records SET data = ? WHERE key = ?").run(JSON.stringify(data), `post:${id}`);
    }
  }

  for (const table of created) db.exec(`DROP TABLE ${table}`);
  setMeta(db, "source", "wordpress");
  setMeta(db, "dump", dumpFile);
  setMeta(db, "prefix", prefix);
  setMeta(db, "siteUrl", siteUrl);
  setMeta(db, "uploadsUrl", uploadsUrl);
  if (options.uploadsDir) setMeta(db, "uploadsDir", options.uploadsDir);
  setMeta(db, "scoutedAt", new Date().toISOString());

  return { prefix, siteUrl, records: Object.values(types).reduce((a, b) => a + b, 0), media: mediaCount, types };
};
