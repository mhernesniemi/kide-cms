import config from "virtual:kide/config";
import type { AppPayload } from "../../admin/app/AdminApp";
import { loadShell } from "../../admin/layouts/AdminLayout";
import { canRead } from "../../admin/lib/access";
import { defineAppPage } from "../../admin/render/app-page";
import { AccountView } from "../../admin/views/AccountView";
import { loadAccountView } from "../../admin/views/AccountView.load";
import type { CmsContext } from "../context";

const load = async (context: CmsContext): Promise<AppPayload | Response> => {
  const data = await loadAccountView(context);
  if (data instanceof Response) return data;
  return {
    title: "Account | Kide CMS",
    shell: await loadShell(context, {
      collections: config.collections.filter((c) => canRead(config, context.locals.user, c.slug)),
      activeCollection: "account",
      customNav: config.admin?.nav,
    }),
    view: { kind: "account", data },
  };
};

export const GET = defineAppPage(load, (kind) => (kind === "account" ? AccountView : null));
