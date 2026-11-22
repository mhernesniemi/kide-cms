import config from "virtual:kide/config";
import type { AppPayload } from "../../../admin/app/AdminApp";
import { loadShell } from "../../../admin/layouts/AdminLayout";
import { canRead } from "../../../admin/lib/access";
import { defineAppPage } from "../../../admin/render/app-page";
import { AssetsView } from "../../../admin/views/AssetsView";
import { loadAssetsView } from "../../../admin/views/AssetsView.load";
import type { CmsContext } from "../../context";

const load = async (context: CmsContext): Promise<AppPayload | Response> => {
  const data = await loadAssetsView(context);
  if (data instanceof Response) return data;
  return {
    title: "Assets | Kide CMS",
    shell: await loadShell(context, {
      collections: config.collections.filter((c) => canRead(config, context.locals.user, c.slug)),
      activeCollection: "assets",
      customNav: config.admin?.nav,
    }),
    view: { kind: "assets", data },
  };
};

export const GET = defineAppPage(load, (kind) => (kind === "assets" ? AssetsView : null));
