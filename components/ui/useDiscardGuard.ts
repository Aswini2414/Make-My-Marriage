"use client";

import { useState } from "react";

/**
 * For a drawer with a form: closing never throws away typing by accident, and never happens
 * while a save is running (the answer would arrive after the drawer is gone). Pass
 * `requestClose` to the Drawer and show `<DiscardPrompt>` while `confirming` is true.
 */
export function useDiscardGuard({
  dirty,
  busy,
  onClose,
}: {
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  function requestClose() {
    if (busy) return;
    // A second Escape or backdrop click while the question is showing means "keep editing".
    if (confirming) return setConfirming(false);
    if (dirty) return setConfirming(true);
    onClose();
  }

  return {
    requestClose,
    confirming,
    keepEditing: () => setConfirming(false),
    discard: onClose,
  };
}
