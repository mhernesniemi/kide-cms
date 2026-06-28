"use client";

import { useMemo, useState } from "react";

import { SubField, blankBlockFields, humanize, type BlockTypesMeta, type RelationOption } from "./block-fields";
import SelectField from "./SelectField";

type Props = {
  name: string;
  value?: string;
  types: BlockTypesMeta;
  blockRelationOptions?: Record<string, RelationOption[]>;
};

type SharedBlock = {
  type: string;
  [field: string]: unknown;
};

function parseInitialBlock(value: string | undefined, types: BlockTypesMeta): SharedBlock {
  const fallbackType = Object.keys(types)[0] ?? "";
  const fallback = fallbackType ? { type: fallbackType, ...blankBlockFields(types[fallbackType] ?? {}) } : { type: "" };
  if (!value) return fallback;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const type = String(parsed.type ?? fallbackType);
    if (!type) return fallback;
    return {
      type,
      ...blankBlockFields(types[type] ?? {}),
      ...parsed,
    };
  } catch {
    return fallback;
  }
}

export default function SharedSectionBlockField({ name, value, types, blockRelationOptions = {} }: Props) {
  const [block, setBlock] = useState<SharedBlock>(() => parseInitialBlock(value, types));
  const typeNames = Object.keys(types);
  const selectedType = block.type;
  const fieldsMeta = types[selectedType] ?? {};
  const serialized = useMemo(() => JSON.stringify(block), [block]);

  const changeType = (typeName: string) => {
    setBlock({ type: typeName, ...blankBlockFields(types[typeName] ?? {}) });
  };

  const updateField = (fieldName: string, fieldValue: unknown) => {
    setBlock((prev) => ({ ...prev, [fieldName]: fieldValue }));
  };

  const relationOptionsFor = (fieldName: string) => blockRelationOptions[`shared:${selectedType}:${fieldName}`] ?? [];

  if (typeNames.length === 0) {
    return (
      <div className="bg-muted/20 text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
        Add at least one block type to a collection before creating shared sections.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="blockType" value={selectedType} />
      <input type="hidden" name={name} value={serialized} />

      <div className="grid gap-2">
        <label className="text-sm font-medium">Block type *</label>
        <SelectField
          name={`${name}_type`}
          value={selectedType}
          placeholder="Select a block type"
          items={typeNames.map((typeName) => ({ value: typeName, label: humanize(typeName) }))}
          onChange={changeType}
        />
      </div>

      <div className="space-y-4 rounded-lg border px-4 py-4">
        {Object.entries(fieldsMeta).map(([fieldName, meta]) => (
          <SubField
            key={fieldName}
            blockKey={`shared_${selectedType}`}
            fieldName={fieldName}
            meta={meta}
            value={block[fieldName]}
            onChange={(v) => updateField(fieldName, v)}
            relationOptions={meta.type === "relation" ? relationOptionsFor(fieldName) : []}
          />
        ))}
      </div>
    </div>
  );
}
