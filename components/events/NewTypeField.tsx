"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/form/TextField";
import { postJson } from "@/lib/api-client";
import { addEventTypeSchema } from "@/modules/events/schema";

type Props = {
  /** Called with the wedding's full custom type list, as the API saved it. */
  onAdded: (custom: string[]) => void;
  onCancel: () => void;
};

/** The "New type name" box that opens under the type dropdown. */
export function NewTypeField({ onAdded, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy) return;
    const parsed = addEventTypeSchema.safeParse({ name });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a type name.");
    setBusy(true);
    setError(undefined);
    const result = await postJson<{ custom: string[] }>("/api/events/types", parsed.data);
    setBusy(false);
    if (result.ok) return onAdded(result.data.custom);
    setError(
      result.error.code === "TYPE_EXISTS" ? "This type already exists." : result.error.message,
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-input border border-border bg-ivory p-4">
      <TextField
        id="new-type-name"
        label="New type name"
        caps
        iconError
        placeholder="e.g. Nalugu"
        autoComplete="off"
        maxLength={40}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          // Enter adds the type; it must not save the whole event form behind it.
          if (e.key === "Enter") {
            e.preventDefault();
            void add();
          }
        }}
        error={error}
        hint="It will stay in your list for future events."
        autoFocus
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="md" onClick={add} disabled={busy} className="h-10">
          Add type
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-11 items-center px-2 text-sm font-medium text-ink-body transition-colors hover:text-plum"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
