import { useState, useRef } from "react";
import { Checkbox } from "./ui/checkbox";

type Props = {
  name: string;
  checked?: boolean;
  disabled?: boolean;
};

export default function CheckboxField({ name, checked: initial = false, disabled }: Props) {
  const [checked, setChecked] = useState(initial);
  const hiddenRef = useRef<HTMLInputElement>(null);

  return (
    <label className="group inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="hidden" name={name} value={checked ? "true" : "false"} ref={hiddenRef} />
      <Checkbox
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
      <span className="text-foreground select-none">{checked ? "Enabled" : "Disabled"}</span>
    </label>
  );
}
