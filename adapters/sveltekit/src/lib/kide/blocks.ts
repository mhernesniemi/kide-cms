import type { Component } from "svelte";

// Block components live in ./blocks/: Hero.svelte renders blocks of type "hero".
const modules = import.meta.glob<{ default: Component<any> }>("./blocks/*.svelte", { eager: true });

export const blockComponents: Record<string, Component<any>> = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const filename = path.split("/").pop()?.replace(".svelte", "") ?? "";
    return [filename.charAt(0).toLowerCase() + filename.slice(1), mod.default];
  }),
);

export const blockFileName = (type: string) => `${type.charAt(0).toUpperCase() + type.slice(1)}.svelte`;
