import type { ReactNode } from "react";
import type { ColorOption, FieldConfig } from "../../core/define";
import { humanize } from "../../core/admin";
import { serializeFieldValue } from "../../core/values";
import { customFields } from "virtual:kide/custom-fields";
import ImagePicker from "./ImagePicker";
import TreeItemsEditor from "./TreeItemsEditor";
import RichTextEditor from "./RichTextEditor";
import ContentEditor from "./ContentEditor";
import SelectField from "./SelectField";
import RelationField from "./RelationField";
import BlockEditor from "./BlockEditor";
import SlugField from "./SlugField";
import CheckboxField from "./CheckboxField";
import TaxonomySelect from "./TaxonomySelect";
import SharedSectionBlockField from "./SharedSectionBlockField";
import ColorField from "./ColorField";
import LinkField from "./LinkField";
import RepeaterInput from "./RepeaterInput";
import { ReadOnlyRepeater } from "./ReadOnlyRepeater";
import { Island } from "../render/island";
import type { SubFieldMeta } from "./block-fields";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

type RelationOption = {
  value: string;
  label: string;
};

type RelationMeta = {
  collectionSlug: string;
  collectionLabel: string;
  hasMany: boolean;
  labelField?: string;
};

type LinkableCollection = { collection: string; label: string };

type SharedSectionOption = {
  id: string;
  title: string;
  blockType: string;
  status?: string;
};

export type FieldControlProps = {
  name: string;
  field: FieldConfig;
  value?: unknown;
  relationOptions?: RelationOption[];
  relationMeta?: RelationMeta;
  readOnly?: boolean;
  linkableCollections?: LinkableCollection[];
  sharedBlockTypes?: Record<string, Record<string, FieldConfig>>;
  sharedSectionOptions?: SharedSectionOption[];
  /** False when the project registers no `shared-sections` collection (or the
   * user may not write to it) — the save-as-shared action stays hidden. */
  sharedSectionsAvailable?: boolean;
  labelActions?: ReactNode;
  /** The project's `admin.colors` palette, the default for color fields. */
  colorPalette?: ColorOption[];
};

export function FieldControl(props: FieldControlProps) {
  const {
    name,
    field,
    value,
    relationOptions = [],
    relationMeta,
    readOnly = false,
    linkableCollections = [],
    sharedBlockTypes = {},
    sharedSectionOptions = [],
    sharedSectionsAvailable = false,
  } = props;

  const label = field.label ?? humanize(name);
  const placeholder = field.admin?.placeholder ?? "";
  const serializedValue = serializeFieldValue(field, value);
  const DEFAULT_ROWS: Record<string, number> = { content: 14, richText: 10, json: 12, blocks: 12 };
  const rows = field.admin?.rows ?? DEFAULT_ROWS[field.type] ?? 5;
  const inputMode = field.type === "number" ? "decimal" : undefined;
  const controlClass = cn("w-full shadow-none", readOnly && "cursor-not-allowed bg-muted text-muted-foreground");
  const isTreeEditor =
    field.type === "json" && (field.admin?.component === "menu-items" || field.admin?.component === "taxonomy-terms");

  // Custom field component: if admin.component is set and not a built-in variant, look for user-provided component
  const builtInComponents = new Set([
    "radio",
    "taxonomy-select",
    "menu-items",
    "taxonomy-terms",
    "shared-section-block",
    "color",
    "link",
    "repeater",
  ]);
  const customName =
    field.admin?.component && !builtInComponents.has(field.admin.component) ? field.admin.component : null;
  const CustomComponent = customName ? (customFields[customName] ?? null) : null;

  // Build serializable block-types metadata for the BlockEditor (`blocks` field) and
  // the inline block inserter (`content` field). Both share the same block-type shape.
  const colorPalette = props.colorPalette ?? [];

  const toSubFieldMeta = (subField: FieldConfig): SubFieldMeta => ({
    type: subField.type,
    label: subField.label,
    required: subField.required,
    options: "options" in subField ? subField.options : undefined,
    from: "from" in subField ? subField.from : undefined,
    admin: subField.admin,
    colors: subField.admin?.component === "color" ? (subField.admin?.colors ?? colorPalette) : undefined,
    defaultValue: subField.defaultValue,
    of: "of" in subField && subField.of ? { type: subField.of.type } : undefined,
    collection: "collection" in subField ? subField.collection : undefined,
    hasMany: "hasMany" in subField ? subField.hasMany : undefined,
    condition: subField.condition,
    itemFields:
      "itemFields" in subField && subField.itemFields
        ? Object.fromEntries(Object.entries(subField.itemFields).map(([name, f]) => [name, toSubFieldMeta(f)]))
        : undefined,
    // A `blocks` sub-field inside a block renders its own nested block editor.
    types:
      subField.type === "blocks"
        ? Object.fromEntries(
            Object.entries(subField.types).map(([typeName, typeFields]) => [
              typeName,
              Object.fromEntries(Object.entries(typeFields).map(([name, f]) => [name, toSubFieldMeta(f)])),
            ]),
          )
        : undefined,
  });

  const toBlockTypesMeta = (source: Record<string, Record<string, FieldConfig>> | null | undefined) =>
    source
      ? Object.fromEntries(
          Object.entries(source).map(([typeName, typeFields]) => [
            typeName,
            Object.fromEntries(
              Object.entries(typeFields).map(([fieldName, subField]) => [fieldName, toSubFieldMeta(subField)]),
            ),
          ]),
        )
      : {};

  const repeaterItemFields =
    "itemFields" in field && field.itemFields
      ? Object.fromEntries(
          Object.entries(field.itemFields).map(([subName, subField]) => [subName, toSubFieldMeta(subField)]),
        )
      : undefined;
  const blockTypesSource = field.type === "blocks" ? field.types : field.type === "content" ? field.blocks : null;
  const blockTypesMeta = toBlockTypesMeta(blockTypesSource);
  const sharedBlockTypesMeta = toBlockTypesMeta(sharedBlockTypes);

  return (
    <div
      className="group/field grid gap-2"
      data-field-name={name}
      {...(field.condition
        ? {
            "data-condition-field": field.condition.field,
            "data-condition-value": JSON.stringify(field.condition.value),
          }
        : {})}
    >
      {!isTreeEditor && field.type !== "boolean" && (
        <div className="flex min-h-5 items-center justify-between gap-2">
          <Label htmlFor={name}>
            {label}
            {field.required ? " *" : ""}
          </Label>
          {props.labelActions}
        </div>
      )}
      {field.type !== "boolean" && field.description && (
        <p className="text-muted-foreground -mt-1 text-xs leading-5">{field.description}</p>
      )}
      {field.type !== "boolean" && field.admin?.help && (
        <p className="text-muted-foreground -mt-1 -mb-0.5 text-xs leading-5">{field.admin.help}</p>
      )}

      {CustomComponent && (
        <Island
          name={`custom:${customName}`}
          component={CustomComponent}
          props={{ name, field, value: serializedValue, readOnly }}
        />
      )}

      {!CustomComponent && (
        <>
          {field.type === "image" && !readOnly && (
            <Island name="ImagePicker" component={ImagePicker} props={{ name, value: serializedValue, placeholder }} />
          )}

          {field.type === "image" && readOnly && (
            <Input
              className={controlClass}
              type="text"
              id={name}
              name={name}
              defaultValue={serializedValue}
              placeholder={placeholder}
              readOnly={readOnly}
            />
          )}

          {(field.type === "text" || field.type === "json") &&
            field.admin?.component === "taxonomy-select" &&
            !readOnly && (
              <Island
                name="TaxonomySelect"
                component={TaxonomySelect}
                props={{
                  name,
                  value: field.type === "json" ? JSON.stringify(Array.isArray(value) ? value : []) : serializedValue,
                  taxonomySlug: field.admin?.taxonomy ?? field.admin?.placeholder ?? "",
                  multiple: field.type === "json",
                }}
              />
            )}

          {field.type === "text" && field.admin?.component === "color" && (
            <Island
              name="ColorField"
              component={ColorField}
              props={{
                name,
                disabled: readOnly,
                value: serializedValue,
                placeholder,
                colors: field.admin?.colors ?? colorPalette,
              }}
            />
          )}

          {(field.type === "text" || field.type === "email" || field.type === "date") &&
            field.admin?.component !== "taxonomy-select" &&
            field.admin?.component !== "color" &&
            (field.type === "text" && field.admin?.rows ? (
              <Textarea
                className={controlClass}
                id={name}
                name={name}
                rows={field.admin.rows}
                defaultValue={serializedValue}
                placeholder={placeholder}
                readOnly={readOnly}
                required={field.required}
              />
            ) : (
              <Input
                className={controlClass}
                type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                id={name}
                name={name}
                defaultValue={serializedValue}
                placeholder={placeholder}
                readOnly={readOnly}
                required={field.required}
              />
            ))}

          {field.type === "slug" && (
            <Island
              name="SlugField"
              component={SlugField}
              props={{
                name,
                value: serializedValue,
                from: field.from,
                readOnly,
                required: field.required,
                placeholder: placeholder || "auto-generated-slug",
                className: controlClass,
              }}
            />
          )}

          {field.type === "number" && (
            <Input
              className={controlClass}
              type="number"
              id={name}
              name={name}
              defaultValue={serializedValue}
              inputMode={inputMode}
              readOnly={readOnly}
              required={field.required}
            />
          )}

          {field.type === "boolean" && (
            <div className="grid gap-1.5">
              <Island
                name="CheckboxField"
                component={CheckboxField}
                props={{ name, checked: Boolean(value), disabled: readOnly, label, required: field.required }}
              />
              {/* Indented to the label text: box (1rem) + gap (0.75rem). */}
              {field.description && <p className="text-muted-foreground pl-7 text-xs leading-5">{field.description}</p>}
              {field.admin?.help && <p className="text-muted-foreground pl-7 text-xs leading-5">{field.admin.help}</p>}
            </div>
          )}

          {field.type === "select" && field.admin?.component !== "radio" && (
            <Island
              name="SelectField"
              component={SelectField}
              props={{
                name,
                value: String(value ?? ""),
                placeholder: "Select an option",
                disabled: readOnly,
                items: field.options.map((option) => ({ value: option, label: option })),
              }}
            />
          )}

          {field.type === "select" && field.admin?.component === "radio" && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 has-disabled:opacity-50">
              {field.options.map((option) => (
                <label
                  key={option}
                  className="hover:text-foreground flex items-center gap-2 text-sm transition-colors has-disabled:cursor-not-allowed has-disabled:hover:text-current"
                >
                  <input
                    data-slot="radio"
                    className="border-input hover:border-primary/60 checked:border-primary checked:hover:border-primary disabled:hover:border-input size-4 shrink-0 appearance-none rounded-full border transition-all checked:border-[5px] disabled:cursor-not-allowed"
                    type="radio"
                    name={name}
                    value={option}
                    defaultChecked={String(value ?? "") === option}
                    disabled={readOnly}
                  />
                  <span className="select-none">{option}</span>
                </label>
              ))}
            </div>
          )}

          {field.type === "relation" && !readOnly && relationMeta && (
            <Island
              name="RelationField"
              component={RelationField}
              props={{
                name,
                value: Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""),
                hasMany: relationMeta.hasMany,
                maxItems: "maxItems" in field ? field.maxItems : undefined,
                options: relationOptions,
                collectionSlug: relationMeta.collectionSlug,
                collectionLabel: relationMeta.collectionLabel,
                labelField: relationMeta.labelField,
              }}
            />
          )}

          {/* No name attribute — the stored value must never be submitted (or clobbered) from here. */}
          {field.type === "relation" && (readOnly || !relationMeta) && (
            <Input
              className={controlClass}
              type="text"
              id={name}
              defaultValue={
                relationOptions.length > 0 ? relationOptions.map((o) => o.label).join(", ") : serializedValue
              }
              readOnly
            />
          )}

          {field.type === "richText" && !readOnly && (
            <Island
              name="RichTextEditor"
              component={RichTextEditor}
              props={{ name, initialValue: value ? JSON.stringify(value) : "", rows }}
            />
          )}

          {field.type === "richText" && readOnly && (
            <Textarea
              className={controlClass}
              id={name}
              name={name}
              rows={rows}
              readOnly={readOnly}
              defaultValue={serializedValue}
            />
          )}

          {field.type === "content" && !readOnly && (
            <Island
              name="ContentEditor"
              component={ContentEditor}
              props={{
                name,
                label,
                initialValue: value ? JSON.stringify(value) : "",
                rows,
                types: blockTypesMeta,
                linkOptions: linkableCollections,
                sharedSections: sharedSectionOptions,
                sharedEnabled: sharedSectionsAvailable,
                fullscreen: field.fullscreen !== false,
              }}
            />
          )}

          {field.type === "content" && readOnly && (
            <Textarea
              className={controlClass}
              id={name}
              name={name}
              rows={rows}
              readOnly={readOnly}
              defaultValue={serializedValue}
            />
          )}

          {field.type === "json" && field.admin?.component === "menu-items" && !readOnly && (
            <Island
              name="TreeItemsEditor"
              component={TreeItemsEditor}
              props={{ name, value: serializedValue, variant: "menu", label, linkOptions: linkableCollections }}
            />
          )}

          {field.type === "json" && field.admin?.component === "taxonomy-terms" && !readOnly && (
            <Island
              name="TreeItemsEditor"
              component={TreeItemsEditor}
              props={{ name, value: serializedValue, variant: "taxonomy", label }}
            />
          )}

          {field.type === "json" && field.admin?.component === "shared-section-block" && !readOnly && (
            <Island
              name="SharedSectionBlockField"
              component={SharedSectionBlockField}
              props={{ name, value: serializedValue, types: sharedBlockTypesMeta }}
            />
          )}

          {field.type === "json" && field.admin?.component === "link" && !readOnly && (
            <Island
              name="LinkField"
              component={LinkField}
              props={{ name, value: serializedValue, linkOptions: linkableCollections }}
            />
          )}

          {field.type === "json" && field.admin?.component === "repeater" && !readOnly && (
            <Island
              name="RepeaterInput"
              component={RepeaterInput}
              props={{ name, value: serializedValue, itemFields: repeaterItemFields, linkOptions: linkableCollections }}
            />
          )}

          {field.type === "json" && field.admin?.component === "repeater" && readOnly && (
            <ReadOnlyRepeater name={name} value={serializedValue} itemFields={repeaterItemFields} />
          )}

          {field.type === "json" &&
            (field.admin?.component === "menu-items" ||
              field.admin?.component === "taxonomy-terms" ||
              field.admin?.component === "shared-section-block") &&
            readOnly && (
              <Textarea
                className={controlClass}
                id={name}
                name={name}
                rows={rows}
                readOnly={readOnly}
                defaultValue={serializedValue}
              />
            )}

          {field.type === "blocks" && !readOnly && (
            <Island
              name="BlockEditor"
              component={BlockEditor}
              props={{
                name,
                value: serializedValue,
                label,
                types: blockTypesMeta,
                linkOptions: linkableCollections,
                sharedSections: "shared" in field && field.shared === false ? [] : sharedSectionOptions,
                sharedEnabled: sharedSectionsAvailable && !("shared" in field && field.shared === false),
              }}
            />
          )}

          {field.type === "blocks" && readOnly && (
            <Textarea
              className={controlClass}
              id={name}
              name={name}
              rows={rows}
              readOnly={readOnly}
              defaultValue={serializedValue}
            />
          )}

          {field.type === "array" && "of" in field && field.of?.type === "text" && (
            <Input
              className={controlClass}
              id={name}
              name={name}
              placeholder={placeholder || "item1, item2, item3"}
              readOnly={readOnly}
              required={field.required}
              defaultValue={serializedValue}
            />
          )}

          {((field.type === "array" && !("of" in field && field.of?.type === "text")) ||
            (field.type === "json" &&
              field.admin?.component !== "menu-items" &&
              field.admin?.component !== "taxonomy-terms" &&
              field.admin?.component !== "shared-section-block" &&
              field.admin?.component !== "link" &&
              field.admin?.component !== "repeater" &&
              !(field.admin?.component === "taxonomy-select" && !readOnly))) && (
            <Textarea
              className={controlClass}
              id={name}
              name={name}
              rows={rows}
              placeholder={placeholder}
              readOnly={readOnly}
              required={field.required}
              defaultValue={serializedValue}
            />
          )}
        </>
      )}
    </div>
  );
}
