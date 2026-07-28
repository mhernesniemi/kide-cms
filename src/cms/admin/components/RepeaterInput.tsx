import { useState } from "react";

import { RepeaterField, type RelationOption, type SubFieldMeta } from "./block-fields";
import type { LinkOptionGroup } from "./InternalLinkPicker";

/**
 * Standalone form control for top-level repeater fields —
 * `fields.json({ admin: { component: "repeater" }, itemFields })` on a
 * collection. Wraps the block editor's RepeaterField (sortable rows, typed
 * sub-field controls, link picker) and mirrors its value into a hidden input
 * so the plain document form submits it as JSON.
 */
export default function RepeaterInput({
  name,
  value,
  itemFields,
  relationOptions,
  linkOptions,
}: {
  name: string;
  value?: string;
  itemFields?: Record<string, SubFieldMeta>;
  relationOptions?: RelationOption[];
  linkOptions?: LinkOptionGroup[];
}) {
  const [items, setItems] = useState<unknown>(() => {
    try {
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  });
  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={JSON.stringify(items ?? [])} />
      <RepeaterField
        blockKey={name}
        itemFields={itemFields}
        relationOptions={relationOptions}
        linkOptions={linkOptions}
        value={items}
        onChange={setItems}
      />
    </div>
  );
}
