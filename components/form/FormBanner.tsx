import type { ReactNode } from "react";
import { ErrorIcon } from "@/components/icons";

/** An error message above a form, in the muted error colours. */
export function FormBanner({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-input border border-error-border bg-error-bg p-3.5 text-[13px] leading-snug text-error ${className}`}
    >
      <ErrorIcon className="mt-px shrink-0 text-lg" />
      <div>{children}</div>
    </div>
  );
}
