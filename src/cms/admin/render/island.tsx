import { createContext, useContext, type ComponentType, type ReactElement, type ReactNode } from "react";
import type { IslandName } from "../client/islands";

export type IslandProps<P> = {
  name: IslandName | `custom:${string}`;
  component: ComponentType<P>;
  props?: P;
  children?: ReactNode;
};

/** Inside the admin app every component is part of one React root, so islands render directly. */
export const InAppRoot = createContext(false);

// Server-rendered islands need react-dom/server; registered by island-server.tsx so the
// browser bundle never pulls it in.
let serverIsland: ((props: IslandProps<object>) => ReactElement) | null = null;
export const registerServerIsland = (render: typeof serverIsland) => {
  serverIsland = render;
};

export function Island<P extends object>(islandProps: IslandProps<P>) {
  const { component: Component, props, children } = islandProps;
  if (useContext(InAppRoot) || !serverIsland) return <Component {...((props ?? {}) as P)}>{children}</Component>;
  return serverIsland(islandProps as IslandProps<object>);
}
