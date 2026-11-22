import AssetsGrid from "../components/AssetsGrid";
import { Island } from "../render/island";
import type { loadAssetsView } from "./AssetsView.load";

export type AssetsViewData = Exclude<Awaited<ReturnType<typeof loadAssetsView>>, Response>;

export function AssetsView(props: AssetsViewData) {
  return <Island name="AssetsGrid" component={AssetsGrid} props={props} />;
}
