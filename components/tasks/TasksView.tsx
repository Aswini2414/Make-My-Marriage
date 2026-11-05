"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { AlertCircleIcon, PlusBoldIcon } from "@/components/icons";
import { getJson, postJson } from "@/lib/api-client";
import { todayIST } from "@/lib/dates";
import {
  canChangeStatus,
  filterTasks,
  filtersToQuery,
  hasActiveFilters,
  type Me,
  NO_FILTERS,
  parseFilters,
  sortTasks,
  summarize,
  type TaskFilters as Filters,
  type TaskTab,
  withStatus,
  withToday,
} from "@/modules/tasks/format";
import type { TaskItem } from "@/modules/tasks/types";
import { FirstTaskPrompt, NoMatchingTasks } from "./TaskEmptyState";
import { TaskDrawer, type TaskEvent, type TaskMember } from "./TaskDrawer";
import { TaskFilters } from "./TaskFilters";
import { TaskRow } from "./TaskRow";
import { TaskStats } from "./TaskStats";

type Props = {
  tasks: TaskItem[];
  members: TaskMember[];
  events: TaskEvent[];
  me: Me & { name: string };
  /** Today in India Standard Time, from the server. */
  today: string;
};

type Panel = { kind: "add"; title?: string } | { kind: "edit"; id: string };

/** The filters that live in the address bar and change at once; the search text is separate. */
type Base = Omit<Filters, "q">;
const baseOf = ({ view, status, eventId }: Filters): Base => ({ view, status, eventId });
const sameBase = (a: Base, b: Filters) =>
  a.view === b.view && a.status === b.status && a.eventId === b.eventId;

const NOT_ALLOWED = "Only the assignee or an Admin can mark this done.";

/** The Tasks page: stat cards, filters in the address bar, the list, and the drawers. */
export function TasksView({ tasks: initial, members, events, me, today: serverToday }: Props) {
  const [rows, setRows] = useState(() => sortTasks(initial));
  const [panel, setPanel] = useState<Panel>();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [banner, setBanner] = useState<string>();
  const returnTo = useRef("add");

  // "Today" and the overdue flags are worked out here, so a tab left open past midnight (IST)
  // moves tasks into Overdue without a reload.
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const tick = () => setToday(todayIST());
    const timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const items = useMemo(() => rows.map((t) => withToday(t, today)), [rows, today]);

  // Coming back to the tab picks up other members' changes, unless something here is in flight.
  const idle = useRef(true);
  useEffect(() => {
    idle.current = pending.size === 0 && !panel;
  }, [pending, panel]);
  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible" || !idle.current) return;
      const result = await getJson<{ items: TaskItem[] }>("/api/tasks");
      if (result.ok && idle.current) setRows(sortTasks(result.data.items));
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  // The filters are state here, so the list reacts at once, and are mirrored to the address bar
  // (so refresh and Back work). The search text is written to the address a moment after typing.
  const searchParams = useSearchParams();
  const [base, setBase] = useState<Base>(() => baseOf(parseFilters(searchParams)));
  const [query, setQuery] = useState(() => parseFilters(searchParams).q);
  const filters = useMemo<Filters>(() => ({ ...base, q: query }), [base, query]);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    // Back or Forward: follow the address bar, which is read from the browser itself.
    const onPop = () => {
      const current = parseFilters(new URLSearchParams(window.location.search));
      setBase((prev) => (sameBase(prev, current) ? prev : baseOf(current)));
      setQuery(current.q);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // A link to /tasks from elsewhere on the page changes the address without our involvement.
  const [seenParams, setSeenParams] = useState(searchParams);
  if (searchParams !== seenParams) {
    setSeenParams(searchParams);
    const current = parseFilters(searchParams);
    if (!sameBase(base, current)) setBase(baseOf(current));
  }

  /** Changes tab, event or status: shown at once, then written to the address bar. */
  function changeBase(patch: Partial<Base>) {
    const next = { ...base, ...patch };
    setBase(next);
    writeUrl({ ...next, q: query }, "push");
  }

  function writeUrl(next: Filters, mode: "push" | "replace") {
    const qs = filtersToQuery(next);
    const url = qs ? `?${qs}` : window.location.pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function changeQuery(text: string) {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = undefined;
      // Read the address when the timer fires, so a tab or filter chosen meanwhile is kept.
      const current = parseFilters(new URLSearchParams(window.location.search));
      writeUrl({ ...current, q: text }, "replace");
    }, 250);
  }

  const { summary, mine } = useMemo(() => summarize(items, me.userId), [items, me.userId]);
  const visible = useMemo(
    () => filterTasks(items, filters, me.userId),
    [items, filters, me.userId],
  );

  // When a drawer closes, focus goes back to the control that opened it.
  const dialogOpen = !!panel;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !dialogOpen && document.activeElement === document.body) {
      (
        document.querySelector<HTMLElement>(`[data-focus-return="${returnTo.current}"]`) ??
        document.querySelector<HTMLElement>('[data-focus-return="add"]')
      )?.focus();
    }
    wasOpen.current = dialogOpen;
  }, [dialogOpen]);

  const open = (next: Panel, from: string) => {
    returnTo.current = from;
    setPanel(next);
  };

  const replaceTask = (task: TaskItem) =>
    setRows((list) => sortTasks(list.map((t) => (t.id === task.id ? task : t))));

  /** Marks a task done or reopens it at once, and puts it back if the server says no. */
  async function toggle(task: TaskItem) {
    if (pending.has(task.id)) return;
    const next = task.status === "done" ? "todo" : "done";
    setBanner(undefined);
    setPending((p) => new Set(p).add(task.id));
    const optimistic = withStatus(task, next, today);
    replaceTask(optimistic);

    const result = await postJson<{ task: TaskItem }>(
      `/api/tasks/${task.id}/${next === "done" ? "done" : "reopen"}`,
    );
    setPending((p) => {
      const rest = new Set(p);
      rest.delete(task.id);
      return rest;
    });
    if (result.ok) return replaceTask(result.data.task);

    if (result.error.code === "NOT_FOUND") {
      setRows((list) => list.filter((t) => t.id !== task.id));
      setBanner("That task no longer exists.");
    } else {
      // Put the old task back only while the optimistic copy is still there: an edit saved in
      // the meantime replaced it, and must not be rolled back.
      setRows((list) => sortTasks(list.map((t) => (t === optimistic ? task : t))));
      setBanner(result.error.code === "NOT_ASSIGNEE" ? NOT_ALLOWED : result.error.message);
    }
  }

  const editing = panel?.kind === "edit" ? items.find((t) => t.id === panel.id) : undefined;
  const overdueNote =
    summary.overdue === 1
      ? "1 task is past its due date."
      : `${summary.overdue} tasks are past their due date.`;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl leading-tight text-plum sm:text-5xl">
            Your <em className="text-champagne-deep">tasks</em>
          </h1>
          <p className="mt-1 text-sm text-ink-body">Who is doing what, and by when.</p>
        </div>
        <Button data-focus-return="add" onClick={() => open({ kind: "add" }, "add")}>
          <PlusBoldIcon className="size-3.5" />
          Add task
        </Button>
      </div>

      <TaskStats summary={summary} />

      {items.length === 0 ? (
        <FirstTaskPrompt onAdd={(title) => open({ kind: "add", title }, "add")} />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          <TaskFilters
            filters={filters}
            query={query}
            overdueCount={summary.overdue}
            events={events}
            onTab={(view: TaskTab) => changeBase({ view })}
            onEvent={(eventId) => changeBase({ eventId: eventId || undefined })}
            onStatus={(status) =>
              changeBase({ status: status === "todo" || status === "done" ? status : undefined })
            }
            onQuery={changeQuery}
          />

          {banner && (
            <FormBanner>
              <div className="flex items-start justify-between gap-3">
                <span>{banner}</span>
                <button
                  type="button"
                  onClick={() => setBanner(undefined)}
                  className="shrink-0 text-xs font-medium underline"
                >
                  Dismiss
                </button>
              </div>
            </FormBanner>
          )}

          {filters.view === "mine" && (
            <p className="flex items-center gap-2 rounded-input border border-border bg-lilac/50 px-4 py-2.5 text-xs text-ink-body">
              Showing tasks assigned to you ({me.name}) · {mine.todo} pending · {mine.done}{" "}
              completed
            </p>
          )}
          {filters.view === "overdue" && summary.overdue > 0 && (
            <p className="flex items-center gap-2 rounded-input border border-error-border bg-error-bg px-4 py-2.5 text-xs text-error">
              <AlertCircleIcon className="shrink-0 text-base" />
              {overdueNote}
            </p>
          )}

          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {visible.length === 0 ? (
              <NoMatchingTasks
                onClear={() => {
                  clearTimeout(searchTimer.current);
                  searchTimer.current = undefined;
                  setBase(baseOf(NO_FILTERS));
                  setQuery("");
                  writeUrl(NO_FILTERS, "push");
                }}
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    me={me}
                    tab={filters.view}
                    pending={pending.has(task.id)}
                    onToggle={toggle}
                    onEdit={(t) => open({ kind: "edit", id: t.id }, t.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          {hasActiveFilters(filters) && visible.length > 0 && (
            <p className="text-xs text-ink-secondary" aria-live="polite">
              Showing {visible.length} of {items.length} tasks
            </p>
          )}
        </div>
      )}

      {panel && (panel.kind === "add" || editing) && (
        <TaskDrawer
          task={editing}
          initialTitle={panel.kind === "add" ? panel.title : undefined}
          me={me}
          members={members}
          events={events}
          today={today}
          canChange={editing ? canChangeStatus(editing, me) : false}
          togglePending={editing ? pending.has(editing.id) : false}
          onToggle={() => editing && toggle(editing)}
          onSaved={(saved) => {
            setRows((list) => {
              const exists = list.some((t) => t.id === saved.id);
              return sortTasks(
                exists ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved],
              );
            });
            returnTo.current = saved.id;
            setPanel(undefined);
          }}
          onDeleted={(id) => {
            setRows((list) => list.filter((t) => t.id !== id));
            returnTo.current = "add";
            setPanel(undefined);
          }}
          onClose={() => setPanel(undefined)}
        />
      )}
    </main>
  );
}
