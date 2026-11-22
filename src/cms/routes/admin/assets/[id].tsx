import config from "virtual:kide/config";
import type { AppPayload } from "../../../admin/app/AdminApp";
import { loadShell } from "../../../admin/layouts/AdminLayout";
import { canRead } from "../../../admin/lib/access";
import { defineAppPage } from "../../../admin/render/app-page";
import { AssetView } from "../../../admin/views/AssetView";
import { loadAssetView } from "../../../admin/views/AssetView.load";
import type { CmsContext } from "../../context";

const load = async (context: CmsContext): Promise<AppPayload | Response> => {
  const data = await loadAssetView(context);
  if (data instanceof Response) return data;
  return {
    title: `${data.asset.filename} | Assets | Kide CMS`,
    shell: await loadShell(context, {
      collections: config.collections.filter((c) => canRead(config, context.locals.user, c.slug)),
      activeCollection: "assets",
      customNav: config.admin?.nav,
      embed: data.isEmbed,
    }),
    view: { kind: "asset", data },
  };
};

export const GET = defineAppPage(load, (kind) => (kind === "asset" ? AssetView : null));
