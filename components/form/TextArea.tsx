import type { ComponentProps, ReactNode } from "react";
import { describe, FieldFrame, inputClass } from "./Field";

type Props = Omit<ComponentProps<"textarea">, "id"> & {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: string;
  caps?: boolean;
  optional?: boolean;
};

/** A multi-line field with the same label, hint and error as TextField. */
export function TextArea({ id, label, error, hint, caps, optional, ...textarea }: Props) {
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} caps={caps} optional={optional}>
      <textarea
        id={id}
        name={id}
        rows={3}
        {...describe(id, error, hint)}
        {...textarea}
        className={`${inputClass(!!error).replace("h-12", "min-h-24 py-3")} resize-none`}
      />
    </FieldFrame>
  );
}
