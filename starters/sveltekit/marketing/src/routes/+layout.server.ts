import { safeUrl } from "@kidecms/core";
import { cms } from "@/cms/.generated/api";

type MenuItem = { id: string; label?: string; href?: string; target?: string };

export const load = async () => {
  const menu = await cms.menus.findOne({ slug: "main" });
  const rawItems: MenuItem[] = Array.isArray(menu?.items) ? menu.items : [];
  // Menu hrefs are CMS-authored content — sanitize and drop anything unsafe.
  const menuItems = rawItems
    .map((item) => ({
      id: item.id,
      label: String(item.label ?? ""),
      target: item.target,
      href: safeUrl(String(item.href ?? "")),
    }))
    .filter((item): item is typeof item & { href: string } => item.href !== null);
  return { menuItems };
};
