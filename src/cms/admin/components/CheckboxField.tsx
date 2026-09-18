import { useState, useRef } from "react";
import { Checkbox } from "./ui/checkbox";

type Props = {
  name: string;
  checked?: boolean;
  disabled?: boolean;
  /** Shown beside the box — a checkbox names itself instead of taking a label above it. */
  label?: string;
  required?: boolean;
};

export default function CheckboxField({ name, checked: initial = false, disabled, label, required }: Props) {
  const [checked, setChecked] = useState(initial);
  const hiddenRef = useRef<HTMLInputElement>(null);

  return (
    <label className="group inline-flex w-fit cursor-pointer items-center gap-3 text-sm has-disabled:cursor-not-allowed">
      <input type="hidden" name={name} value={checked ? "true" : "false"} ref={hiddenRef} />
      <Checkbox
        id={name}
        className="group-hover:border-primary/60 disabled:group-hover:border-input"
        checked={checked}
        onCheckedChange={(v) => {
          setChecked(Boolean(v));
          setTimeout(() => {
            hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
          }, 0);
        }}
        disabled={disabled}
      />
      {label && (
        <span className="text-foreground/80 leading-none font-medium select-none">
          {label}
          {required ? " *" : ""}
        </span>
      )}
    </label>
  );
}
