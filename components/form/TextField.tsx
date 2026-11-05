import type { ComponentProps, ReactNode } from "react";
import { describe, FieldFrame, inputClass } from "./Field";

type Props = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: ReactNode;
  error?: string;
  /** Red border without a message, when a banner explains the problem. */
  invalid?: boolean;
  hint?: string;
  labelAside?: ReactNode;
  /** Onboarding style errors: red label, thicker border and an icon. */
  iconError?: boolean;
  /** Larger label and hint, as on the accept-invite screens. */
  large?: boolean;
  /** Small uppercase label, as in the Events drawer. */
  caps?: boolean;
  optional?: boolean;
};

export function TextField({
  id,
  label,
  error,
  invalid,
  hint,
  labelAside,
  iconError,
  large,
  caps,
  optional,
  ...input
}: Props) {
  return (
    <FieldFrame
      id={id}
      label={label}
      error={error}
      hint={hint}
      labelAside={labelAside}
      iconError={iconError}
      large={large}
      caps={caps}
      optional={optional}
    >
      <input
        id={id}
        name={id}
        {...describe(id, error, hint, invalid)}
        {...input}
        className={inputClass(!!error || !!invalid, iconError)}
      />
    </FieldFrame>
  );
}
