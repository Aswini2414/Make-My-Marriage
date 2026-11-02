"use client";

import { type ComponentProps, type ReactNode, useState } from "react";
import { VisibilityIcon, VisibilityOffIcon } from "@/components/icons";
import { describe, FieldFrame, inputClass } from "./Field";

type Props = Omit<ComponentProps<"input">, "id" | "type"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  labelAside?: ReactNode;
  large?: boolean;
  /** Red border without a message, when a banner explains the problem. */
  invalid?: boolean;
};

/** A password input with a show/hide button. */
export function PasswordField({
  id,
  label,
  error,
  hint,
  labelAside,
  large,
  invalid,
  ...input
}: Props) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? VisibilityOffIcon : VisibilityIcon;
  return (
    <FieldFrame
      id={id}
      label={label}
      error={error}
      hint={hint}
      labelAside={labelAside}
      large={large}
    >
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          {...describe(id, error, hint, invalid)}
          {...input}
          className={`${inputClass(!!error || !!invalid)} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={input.disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-0 right-0 flex size-12 items-center justify-center text-lg text-ink-secondary transition-colors hover:text-plum disabled:cursor-not-allowed disabled:text-ink-secondary/50"
        >
          <Icon />
        </button>
      </div>
    </FieldFrame>
  );
}
