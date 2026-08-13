import { defineCollection, fields } from "@kidecms/core";

// Menu items render as root → section → link (see SiteHeader.tsx's rendering,
// which only ever reads item.children and section.children — a 4th level is
// accepted by this JSON field but silently never rendered). The tree editor
// caps nesting at the same depth (see tree-utils.ts MENU_MAX_DEPTH), but that
// only guards the admin UI — this hook is what actually rejects a malformed
// save, including writes made directly through the API/MCP tools.
const MENU_MAX_DEPTH = 2;

type MenuItem = { id?: unknown; label?: unknown; children?: unknown };

function assertMenuDepth(items: unknown, depth = 0): void {
  if (!Array.isArray(items)) return;
  for (const item of items as MenuItem[]) {
    const children = item.children;
    if (depth >= MENU_MAX_DEPTH && Array.isArray(children) && children.length > 0) {
      const name = String(item.label ?? item.id ?? "item");
      throw new Error(
        `Menu items may only nest ${MENU_MAX_DEPTH + 1} levels deep (root → section → link) — "${name}" has a child that would never render.`,
      );
    }
    assertMenuDepth(children, depth + 1);
  }
}

export default defineCollection({
  slug: "menus",
  labels: { singular: "Menu", plural: "Menus" },
  timestamps: true,
  views: {
    list: { columns: ["name", "slug", "_updatedAt"] },
  },
  fields: {
    name: fields.text({ required: true }),
    slug: fields.slug({ from: "name", admin: { position: "sidebar" } }),
    items: fields.json({
      translatable: true,
      admin: { component: "menu-items" },
    }),
  },
  hooks: {
    beforeCreate(data) {
      if (data.items !== undefined) assertMenuDepth(data.items);
      return data;
    },
    beforeUpdate(data) {
      if (data.items !== undefined) assertMenuDepth(data.items);
      return data;
    },
    beforeUpsertTranslation(data) {
      if (data.items !== undefined) assertMenuDepth(data.items);
      return data;
    },
  },
});
