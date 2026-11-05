import type { ReactNode } from "react";
import { AlertCircleIcon } from "@/components/icons";

// Shared look of a form field: label, input, then an error that replaces the hint.

export function inputClass(invalid: boolean, strong = false) {
  return [
    "h-12 w-full rounded-input border bg-surface px-4 text-sm text-ink transition-colors",
    "placeholder:text-ink-secondary/60 focus:outline-none focus:ring-[3px]",
    "disabled:cursor-not-allowed disabled:bg-surface/70 disabled:text-ink/70",
    invalid
      ? `border-error focus:border-error focus:ring-error/15 ${strong ? "border-2 ring-1 ring-error" : ""}`
      : "border-border focus:border-plum focus:ring-plum/12",
  ].join(" ");
}

type FrameProps = {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: string;
  /** Sits opposite the label, such as "Forgot password?". */
  labelAside?: ReactNode;
  /** The onboarding style: red label and a small alert icon before the message. */
  iconError?: boolean;
  /** Larger label and hint, as on the accept-invite screens. */
  large?: boolean;
  /** Small uppercase label, as in the Events drawer. */
  caps?: boolean;
  /** Adds a quiet "(optional)" after the label. */
  optional?: boolean;
  children: ReactNode;
};

export function FieldFrame({
  id,
  label,
  error,
  hint,
  labelAside,
  iconError,
  large,
  caps,
  optional,
  children,
}: FrameProps) {
  return (
    <div>
      <div className={`${large ? "mb-1.5" : "mb-2"} flex items-center justify-between`}>
        <label
          htmlFor={id}
          className={`block ${
            caps
              ? "text-[11px] font-semibold tracking-wider text-ink-secondary uppercase"
              : `${large ? "text-sm" : "text-xs"} font-medium ${iconError && error ? "text-error" : "text-ink"}`
          }`}
        >
          {label}
          {optional && (
            <span className="ml-1 font-normal tracking-normal normal-case">(optional)</span>
          )}
        </label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p
          id={`${id}-message`}
          className={
            iconError
              ? "mt-1.5 flex items-center gap-1 text-xs text-error"
              : "mt-1.5 text-[11px] font-medium text-error"
          }
        >
          {iconError && <AlertCircleIcon className="shrink-0 text-sm" />}
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-message`}
          className={`mt-1.5 ${large ? "text-xs" : "text-[11px]"} text-ink-secondary`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The aria attributes that tie an input to its message. */
export function describe(id: string, error?: string, hint?: string, invalid?: boolean) {
  return {
    "aria-invalid": invalid || !!error || undefined,
    "aria-describedby": error || hint ? `${id}-message` : undefined,
  };
}
