"use client";

import { InlineSelect } from "@/components/form/InlineSelect";
import { SearchIcon } from "@/components/icons";
import { TASK_TABS, type TaskFilters as Filters, type TaskTab } from "@/modules/tasks/format";

type Props = {
  filters: Filters;
  /** The search box's own text, which updates as you type. */
  query: string;
  overdueCount: number;
  events: { id: string; name: string }[];
  onTab: (tab: TaskTab) => void;
  onEvent: (eventId: string) => void;
  onStatus: (status: string) => void;
  onQuery: (query: string) => void;
};

const TAB_LABEL: Record<TaskTab, string> = {
  all: "All tasks",
  mine: "My tasks",
  overdue: "Overdue",
};

/** The tabs, the Event and Status dropdowns and the search box. Event and Status stay on every tab. */
export function TaskFilters({
  filters,
  query,
  overdueCount,
  events,
  onTab,
  onEvent,
  onStatus,
  onQuery,
}: Props) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        role="group"
        aria-label="Which tasks"
        className="inline-flex w-fit max-w-full shrink-0 rounded-full border border-border bg-lilac/50 p-1"
      >
        {TASK_TABS.map((tab) => {
          const active = filters.view === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={active}
              onClick={() => onTab(tab)}
              className={`min-h-11 rounded-full px-4 text-xs font-medium whitespace-nowrap transition-colors sm:min-h-9 ${
                active ? "bg-plum text-ivory shadow-card" : "text-ink-body hover:text-plum"
              }`}
            >
              {TAB_LABEL[tab]}
              {tab === "overdue" && overdueCount > 0 && ` (${overdueCount})`}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <InlineSelect
          label="Event:"
          value={filters.eventId ?? ""}
          onChange={onEvent}
          options={[
            { value: "", label: "All events" },
            ...events.map((e) => ({ value: e.id, label: e.name })),
          ]}
        />
        <InlineSelect
          label="Status:"
          value={filters.status ?? ""}
          onChange={onStatus}
          options={[
            { value: "", label: "All (To do / Done)" },
            { value: "todo", label: "To do" },
            { value: "done", label: "Done" },
          ]}
        />
        <div className="relative col-span-2 min-w-[12rem] sm:w-64 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-secondary" />
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
            autoComplete="off"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className="h-11 w-full rounded-input border border-border bg-surface pr-3 pl-10 text-xs text-ink transition-colors placeholder:text-ink-secondary/70 focus:border-plum focus:ring-[3px] focus:ring-plum/12 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
