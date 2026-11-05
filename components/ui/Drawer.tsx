"use client";

import { type ReactNode, useId, useRef } from "react";
import { CloseOutlineIcon } from "@/components/icons";
import { useFocusTrap } from "./useFocusTrap";

type Props = {
  title: ReactNode;
  subtitle?: string;
  onClose: () => void;
  /** 520px by default; "narrow" is 480px. Both are full width on phones. */
  width?: "default" | "narrow";
  /** Pinned under the scrolling body, such as the Cancel and Save buttons. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * A panel that slides in from the right (520px, full width on phones). Mount it only while
 * it is open: it takes focus on mount and gives it back on unmount.
 */
export function Drawer({ title, subtitle, onClose, width = "default", footer, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panel, onClose);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-plum/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative ml-auto flex h-full w-full flex-col border-l border-border bg-surface shadow-md ${
          width === "narrow" ? "max-w-[480px]" : "max-w-[520px]"
        }`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-2xl leading-tight text-plum">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-secondary">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-plum"
          >
            <CloseOutlineIcon className="size-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="border-t border-border bg-ivory px-5 py-4 sm:px-6">{footer}</div>
        )}
      </div>
    </div>
  );
}
