"use client";

import { useId } from "react";
import { TextField } from "@/components/form/TextField";
import type { HouseholdItem } from "@/modules/guests/types";

type Props = {
  value: string;
  onChange: (value: string) => void;
  households: HouseholdItem[];
  error?: string;
};

/**
 * Household or family: free text with the names already in use offered as you type (a native
 * datalist, so the keyboard and phone pickers work), plus the three biggest as one-tap chips.
 */
export function HouseholdField({ value, onChange, households, error }: Props) {
  const listId = useId();
  const suggested = [...households]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .filter((h) => h.name !== value)
    .slice(0, 3);
  return (
    <div>
      <TextField
        id="household"
        caps
        label="Household or family"
        placeholder="Select or type a household"
        autoComplete="off"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      <datalist id={listId}>
        {households.map((h) => (
          <option key={h.name} value={h.name} />
        ))}
      </datalist>
      {suggested.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-secondary">Suggested:</span>
          {suggested.map((h) => (
            <button
              key={h.name}
              type="button"
              onClick={() => onChange(h.name)}
              className="flex min-h-11 max-w-full items-center rounded-full bg-lilac px-3 py-1 text-xs text-plum transition-colors hover:bg-heather sm:min-h-8"
            >
              <span className="truncate">{h.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
