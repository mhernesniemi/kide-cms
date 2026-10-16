import "virtual:kide/admin-css";
import type { ComponentType } from "react";
import { customFields } from "virtual:kide/custom-fields";
import { defineIslandElement } from "./island-element";
import { islands, type IslandName } from "./islands";

const CUSTOM_PREFIX = "custom:";

const loadComponent = async (name: string): Promise<ComponentType<any> | undefined> => {
  if (name.startsWith(CUSTOM_PREFIX)) return customFields[name.slice(CUSTOM_PREFIX.length)];
  const load = islands[name as IslandName];
  return load ? (await load()).default : undefined;
};

defineIslandElement(loadComponent);
