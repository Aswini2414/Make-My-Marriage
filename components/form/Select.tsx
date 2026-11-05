import type { ComponentProps, ReactNode } from "react";
import { KeyboardArrowDownIcon } from "@/components/icons";
import { describe, FieldFrame, inputClass } from "./Field";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = Omit<ComponentProps<"select">, "id" | "children"> & {
  id: string;
  label: ReactNode;
  options: SelectOption[];
  /** Shown while nothing is chosen. */
  placeholder?: string;
  error?: string;
  hint?: string;
  caps?: boolean;
  optional?: boolean;
};

/** A native select, so the keyboard and phone pickers work, styled like TextField. */
export function Select({
  id,
  label,
  options,
  placeholder,
  error,
  hint,
  caps,
  optional,
  value,
  ...select
}: Props) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} caps={caps} optional={optional}>
      <div className="relative">
        <select
          id={id}
          name={id}
          value={value}
          {...describe(id, error, hint)}
          {...select}
          className={`${inputClass(!!error)} cursor-pointer appearance-none pr-11 ${
            value === "" ? "text-ink-secondary/70" : ""
          }`}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <KeyboardArrowDownIcon className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-ink-secondary" />
      </div>
    </FieldFrame>
  );
}
