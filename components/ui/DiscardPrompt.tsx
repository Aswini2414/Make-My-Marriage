import { Button } from "@/components/Button";

/** The drawer footer's "Discard your changes?" question. Pair it with useDiscardGuard. */
export function DiscardPrompt({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-body">Discard your changes?</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="md"
          className="h-11"
          autoFocus
          onClick={onKeep}
        >
          Keep editing
        </Button>
        <button
          type="button"
          onClick={onDiscard}
          className="flex h-11 items-center px-3 text-sm font-medium text-error transition-colors hover:text-error/80"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
