"use client";

import { type ReactNode, useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

type Props = {
  /** Read out by screen readers; the visible heading lives in `children`. */
  label: string;
  onClose: () => void;
  children: ReactNode;
};

/** A centred dialog over a dimmed page. Mount it only while it is open. */
export function Modal({ label, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-plum/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative max-h-full w-full max-w-[500px] overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-md sm:p-7"
      >
        {children}
      </div>
    </div>
  );
}
