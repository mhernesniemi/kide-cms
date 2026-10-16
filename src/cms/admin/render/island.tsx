import type { ComponentType, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import type { IslandName } from "../client/islands";

// renderToString is synchronous, so a module-level counter is safe: each page
// render resets it and no other render can interleave.
let islandCount = 0;
export const resetIslands = () => {
  islandCount = 0;
};

type IslandProps<P> = {
  name: IslandName | `custom:${string}`;
  component: ComponentType<P>;
  props?: P;
  children?: ReactNode;
};

/**
 * Server-renders a React component the browser hydrates as its own root. Each
 * island renders separately with its own id prefix so useId values match the
 * client's hydrateRoot; props go through JSON so both sides see identical data.
 */
export function Island<P extends object>({ name, component: Component, props, children }: IslandProps<P>) {
  const prefix = `i${islandCount++}-`;
  const json = JSON.stringify(props ?? {});
  const parsed = JSON.parse(json) as P;
  const slot = children === undefined ? undefined : renderToString(<>{children}</>);
  const element = (
    <Component {...parsed}>
      {slot === undefined ? undefined : (
        <kide-slot dangerouslySetInnerHTML={{ __html: slot }} suppressHydrationWarning />
      )}
    </Component>
  );
  const html = renderToString(element, { identifierPrefix: prefix });
  return (
    <kide-island ssr="" component={name} prefix={prefix} props={json} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
