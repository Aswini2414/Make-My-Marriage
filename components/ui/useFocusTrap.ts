"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Controls inside `root` that can take focus right now (not hidden or collapsed). */
function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );
}

// Open dialogs, innermost last. Only the innermost one answers Escape and Tab.
const stack: symbol[] = [];

/**
 * For a drawer or modal that is on screen: moves focus inside, keeps Tab inside, closes on
 * Escape, stops the page behind from scrolling, and puts focus back on whatever opened it.
 * Mount the dialog only while it is open; this runs once, on mount.
 */
export function useFocusTrap(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  // Always the latest onClose, without re-running the effect (which would reset focus).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const me = Symbol("dialog");
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const el = panel.current;
    // Start on the marked control, else the first form field, else the first control (which
    // in a drawer is its Close button).
    const controls = el ? focusable(el) : [];
    (
      controls.find((c) => c.hasAttribute("data-autofocus")) ??
      controls.find((c) => c.matches("input, select, textarea")) ??
      controls[0]
    )?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return close.current();
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = focusable(panel.current);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!panel.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = previousOverflow;
      // When a drawer hands over to a modal, this runs before the modal mounts, so the modal
      // records the same opener and gives focus back to it.
      if (opener?.isConnected) opener.focus();
    };
  }, [panel]);
}
