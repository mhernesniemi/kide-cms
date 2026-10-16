import type { ComponentType } from "react";

type IslandModule = { default: ComponentType<any> };

/** Every component a page may hydrate, loaded on demand in the browser. */
export const islands = {
  AiGenerateButton: () => import("../components/AiGenerateButton"),
  AssetsGrid: () => import("../components/AssetsGrid"),
  BlockEditor: () => import("../components/BlockEditor"),
  CheckboxField: () => import("../components/CheckboxField"),
  CollaborationReviewBar: () => import("../components/CollaborationReviewBar"),
  ColorField: () => import("../components/ColorField"),
  CommandPalette: () => import("../components/CommandPalette"),
  ContentEditor: () => import("../components/ContentEditor"),
  DocumentActions: () => import("../components/DocumentActions"),
  DocumentLock: () => import("../components/DocumentLock"),
  DocumentsDataTable: () => import("../components/DocumentsDataTable"),
  FocalPointSelector: () => import("../components/FocalPointSelector"),
  ImagePicker: () => import("../components/ImagePicker"),
  LinkField: () => import("../components/LinkField"),
  LiveHeading: () => import("../components/LiveHeading"),
  MobileSidebar: () => import("../components/MobileSidebar"),
  PasskeySettings: () => import("../components/PasskeySettings"),
  PasskeySignIn: () => import("../components/PasskeySignIn"),
  RelationField: () => import("../components/RelationField"),
  RepeaterInput: () => import("../components/RepeaterInput"),
  RichTextEditor: () => import("../components/RichTextEditor"),
  SelectField: () => import("../components/SelectField"),
  SharedSectionBlockField: () => import("../components/SharedSectionBlockField"),
  SidebarUserMenu: () => import("../components/SidebarUserMenu"),
  SlugField: () => import("../components/SlugField"),
  TaxonomySelect: () => import("../components/TaxonomySelect"),
  TreeItemsEditor: () => import("../components/TreeItemsEditor"),
  TreeSelect: () => import("../components/TreeSelect"),
  TwoFactorSettings: () => import("../components/TwoFactorSettings"),
  UnsavedGuard: () => import("../components/UnsavedGuard"),
} satisfies Record<string, () => Promise<IslandModule>>;

export type IslandName = keyof typeof islands;
