export type TreeItem = {
  id: string;
  children: TreeItem[];
  [key: string]: unknown;
};

export function generateId() {
  return "ti_" + Math.random().toString(36).slice(2, 9);
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseItems(value?: string): TreeItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function cloneItems(items: TreeItem[]): TreeItem[] {
  return JSON.parse(JSON.stringify(items));
}

export function createBlankItem(): TreeItem {
  return { id: generateId(), children: [] };
}

export function getItemLabel(item: TreeItem, variant: "menu" | "taxonomy"): string {
  return String(variant === "menu" ? item.label : item.name) || "—";
}

export function getItemSublabel(item: TreeItem, variant: "menu" | "taxonomy"): string {
  return String(variant === "menu" ? item.href : item.slug) || "";
}

export function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItemById(item.children, id);
    if (found) return found;
  }
  return null;
}

export function findParentList(items: TreeItem[], id: string): TreeItem[] | null {
  for (const item of items) {
    if (item.id === id) return items;
    const found = findParentList(item.children, id);
    if (found) return found;
  }
  return null;
}

export function findItemDepth(items: TreeItem[], id: string, depth = 0): number {
  for (const item of items) {
    if (item.id === id) return depth;
    const found = findItemDepth(item.children, id, depth + 1);
    if (found >= 0) return found;
  }
  return -1;
}

export function canIndent(items: TreeItem[], id: string): boolean {
  const check = (list: TreeItem[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return i > 0;
      if (check(list[i].children)) return true;
    }
    return false;
  };
  return check(items);
}

export function canOutdent(items: TreeItem[], id: string): boolean {
  return findItemDepth(items, id) > 0;
}
