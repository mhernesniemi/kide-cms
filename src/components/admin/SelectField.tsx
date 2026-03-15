import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/admin/ui/select";

type SelectOption = { label: string; value: string };

type Props = {
  name: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  items: SelectOption[];
  onChange?: (value: string) => void;
};

export default function SelectField({
  name,
  value: initialValue,
  placeholder = "Select an option",
  disabled,
  items,
  onChange: onChangeProp,
}: Props) {
  const [value, setValue] = useState(initialValue ?? "");

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        items={items}
        value={value}
        onValueChange={(v) => {
          setValue(v ?? "");
          onChangeProp?.(v ?? "");
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
