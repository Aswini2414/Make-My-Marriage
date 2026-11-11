"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { PlusBoldIcon, UploadIcon } from "@/components/icons";
import { getJson, postJson } from "@/lib/api-client";
import {
  type FetchPage,
  type GuestFilters as Filters,
  guestEventNames,
  guestFiltersToQuery,
  hasActiveGuestFilters,
  listQuery,
  NO_FILTERS,
  PAGE_SIZE,
  parseGuestFilters,
  showingText,
  walkToPage,
} from "@/modules/guests/format";
import type { GuestItem, GuestList, GuestSummary, HouseholdItem } from "@/modules/guests/types";
import { BulkBar } from "./BulkBar";
import { DeleteGuestModal } from "./DeleteGuestModal";
import { GuestCards } from "./GuestCards";
import { GuestDrawer } from "./GuestDrawer";
import { GuestEmptyState, NoMatchingGuests } from "./GuestEmptyState";
import { GuestFilters } from "./GuestFilters";
import { GuestStats } from "./GuestStats";
import { GuestTable } from "./GuestTable";

type Props = {
  /** The page the address bar asked for, loaded on the server. */
  initial: { list: GuestList; filters: Filters; cursors: (string | undefined)[] };
  summary: GuestSummary;
  events: { id: string; name: string }[];
  households: HouseholdItem[];
};

type Panel = { kind: "add" } | { kind: "edit"; guest: GuestItem };
type Deleting = { kind: "one"; guest: GuestItem } | { kind: "many"; ids: string[] };

/** The part of the filters that decides which cursors are valid (everything except the page). */
const cursorKey = (f: Filters) => guestFiltersToQuery({ ...f, page: 1 });

const LOAD_FAILED = "We couldn't load the guest list. Check your connection and try again.";

/** The Guests page: stats, filters in the address bar, the list, bulk actions and the drawers. */
export function GuestsView({
  initial,
  summary: initialSummary,
  events,
  households: initialHouseholds,
}: Props) {
  const [list, setList] = useState(initial.list);
  // The page `list` holds. `filters.page` moves first, so "Showing 51–75" would otherwise be
  // paired with the old rows while the next page loads.
  const [listPage, setListPage] = useState(initial.filters.page);
  const [filters, setFilters] = useState(initial.filters);
  const [query, setQuery] = useState(initial.filters.q);
  const [summary, setSummary] = useState(initialSummary);
  const [households, setHouseholds] = useState(initialHouseholds);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string>();
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [panel, setPanel] = useState<Panel>();
  const [deleting, setDeleting] = useState<Deleting>();
  const [bulkBusy, setBulkBusy] = useState(false);

  // The cursors of the pages already seen for the current filters, so Next and Previous are one
  // request. `cursors[n]` fetches page n + 1.
  const cursors = useRef({ key: cursorKey(initial.filters), list: initial.cursors });
  const latest = useRef(0);
  const filtersRef = useRef(filters);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const returnTo = useRef("add");

  const writeUrl = useCallback((next: Filters, mode: "push" | "replace") => {
    const qs = guestFiltersToQuery(next);
    const url = qs ? `?${qs}` : window.location.pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  /**
   * Loads the page `next` asks for. A page whose cursor is known is one request; any other is
   * reached by following the cursors from the first page. Answers that arrive after a newer
   * request was made are dropped.
   */
  const load = useCallback(
    async (next: Filters, { fresh = false }: { fresh?: boolean } = {}) => {
      const id = ++latest.current;
      setLoading(true);
      setBanner(undefined);
      let failed = false;
      const fetchPage: FetchPage = async (cursor) => {
        const result = await getJson<GuestList>(`/api/guests?${listQuery(next, cursor)}`);
        if (result.ok) return result.data;
        failed = true;
        return undefined;
      };
      const key = cursorKey(next);
      const known = cursors.current.key === key && !fresh ? cursors.current.list : [undefined];
      let reached: { list: GuestList; cursors: (string | undefined)[]; page: number } | undefined;
      if (next.page === 1 || known[next.page - 1] !== undefined) {
        const cursor = next.page === 1 ? undefined : known[next.page - 1];
        const page = await fetchPage(cursor);
        // An empty page past the first means the list got shorter: walk back to the last page.
        if (page && page.items.length === 0 && next.page > 1) {
          reached = await walkToPage(fetchPage, next.page);
        } else if (page) {
          reached = { list: page, cursors: known, page: next.page };
        }
      } else {
        reached = await walkToPage(fetchPage, next.page);
      }
      if (id !== latest.current) return;
      setLoading(false);
      if (!reached) {
        setBanner(failed ? LOAD_FAILED : "Something went wrong. Please try again.");
        return;
      }
      const merged = [...known];
      reached.cursors.forEach((c, i) => {
        if (c !== undefined) merged[i] = c;
      });
      if (reached.list.nextCursor) merged[reached.page] = reached.list.nextCursor;
      cursors.current = { key, list: merged };
      setList(reached.list);
      setListPage(reached.page);
      // Selected guests that are no longer on this page (deleted or moved by someone else) go.
      const onPage = new Set(reached.list.items.map((g) => g.id));
      setSelected((s) => (s.size === 0 ? s : new Set([...s].filter((id) => onPage.has(id)))));
      if (reached.page !== next.page) {
        // The page asked for is past the end (guests were deleted): show the last one.
        const fixed = { ...next, page: reached.page };
        filtersRef.current = fixed;
        setFilters(fixed);
        writeUrl(fixed, "replace");
      }
    },
    [writeUrl],
  );

  /** Moves to new filters or a new page: shown at once, written to the address bar, loaded. */
  const apply = useCallback(
    (next: Filters, mode: "push" | "replace" = "push") => {
      filtersRef.current = next;
      setFilters(next);
      setSelected(new Set());
      writeUrl(next, mode);
      void load(next);
    },
    [load, writeUrl],
  );

  const refreshNumbers = useCallback(async () => {
    const [s, h] = await Promise.all([
      getJson<GuestSummary>("/api/guests/summary"),
      getJson<{ items: HouseholdItem[] }>("/api/guests/households"),
    ]);
    if (s.ok) setSummary(s.data);
    if (h.ok) setHouseholds(h.data.items);
  }, []);

  /** After any change: the list (from the first page, so cursors are not stale) and the numbers. */
  const refresh = useCallback(async () => {
    await Promise.all([load(filtersRef.current, { fresh: true }), refreshNumbers()]);
  }, [load, refreshNumbers]);

  /** Follows an address-bar change this page did not make itself (Back, or a link to /guests). */
  const syncFromUrl = useCallback(
    (search: string) => {
      const parsed = parseGuestFilters(new URLSearchParams(search));
      // A link to an event that has since been deleted shows the whole list.
      const current =
        parsed.eventId && !events.some((e) => e.id === parsed.eventId)
          ? { ...parsed, eventId: undefined }
          : parsed;
      if (guestFiltersToQuery(current) === guestFiltersToQuery(filtersRef.current)) return;
      filtersRef.current = current;
      setFilters(current);
      setQuery(current.q);
      setSelected(new Set());
      void load(current);
    },
    [events, load],
  );

  // Back and Forward follow the address bar.
  useEffect(() => {
    const onPop = () => syncFromUrl(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

  // So does a client-side link to /guests from elsewhere (the sidebar, the dashboard checklist)
  // while this page is open with other filters: the page stays mounted, so its props are ignored.
  const search = useSearchParams().toString();
  const seenSearch = useRef(search);
  useEffect(() => {
    if (seenSearch.current === search) return;
    seenSearch.current = search;
    syncFromUrl(search);
  }, [search, syncFromUrl]);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // Coming back to the tab picks up other members' changes, unless something is in progress.
  const idle = useRef(true);
  useEffect(() => {
    idle.current = !panel && !deleting && !bulkBusy;
  }, [panel, deleting, bulkBusy]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && idle.current) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  function changeQuery(text: string) {
    setQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = undefined;
      const trimmed = text.trim();
      if (trimmed === filtersRef.current.q) return;
      apply({ ...filtersRef.current, q: trimmed, page: 1 }, "replace");
    }, 300);
  }

  function clearFilters() {
    clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setQuery("");
    apply(NO_FILTERS);
  }

  // When a drawer closes, focus goes back to the control that opened it.
  const dialogOpen = !!panel || !!deleting;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !dialogOpen && document.activeElement === document.body) {
      const visible = (key: string) =>
        [...document.querySelectorAll<HTMLElement>(`[data-focus-return="${key}"]`)].find(
          (el) => el.offsetParent !== null,
        );
      (visible(returnTo.current) ?? visible("add"))?.focus();
    }
    wasOpen.current = dialogOpen;
  }, [dialogOpen]);

  const openPanel = (next: Panel, from: string) => {
    returnTo.current = from;
    setPanel(next);
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((s) => {
      const everyOne = list.items.every((g) => s.has(g.id));
      const next = new Set(s);
      for (const g of list.items) {
        if (everyOne) next.delete(g.id);
        else next.add(g.id);
      }
      return next;
    });

  async function applyBulk(mode: "add" | "remove", eventIds: string[]) {
    setBulkBusy(true);
    setBanner(undefined);
    const guestIds = [...selected];
    const result = await postJson<{ updated: number }>("/api/guests/bulk-events", {
      guestIds,
      [mode]: eventIds,
    });
    setBulkBusy(false);
    if (result.ok) {
      setSelected(new Set());
      setNotice(
        `${mode === "add" ? "Assigned" : "Removed"} ${result.data.updated} ${
          result.data.updated === 1 ? "guest" : "guests"
        }.`,
      );
    } else if (result.error.code === "NOT_FOUND") {
      setSelected(new Set());
      setBanner("Some of the selected guests no longer exist. The list has been refreshed.");
    } else {
      return setBanner(result.error.message);
    }
    void refresh();
  }

  const items = list.items;
  const noGuestsAtAll = summary.total === 0 && list.total === 0 && !hasActiveGuestFilters(filters);
  const filtered = hasActiveGuestFilters(filters);
  const selectedNames = useMemo(
    () => items.filter((g) => selected.has(g.id)).map((g) => g.name),
    [items, selected],
  );
  const listProps = {
    items,
    events,
    selected,
    onToggle: toggle,
    onTogglePage: togglePage,
    onEdit: (guest: GuestItem) => openPanel({ kind: "edit", guest }, guest.id),
    onDelete: (guest: GuestItem) => {
      returnTo.current = guest.id;
      setDeleting({ kind: "one", guest });
    },
  };

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:gap-8 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl leading-tight text-plum sm:text-5xl">
            Your <em className="text-champagne-deep">guests</em>
          </h1>
          <p className="mt-1 text-sm text-ink-body">
            One list for the whole wedding. Choose who is invited to which event.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ButtonLink href="/guests/import" variant="secondary" className="border-champagne">
            <UploadIcon className="text-base" />
            Import
          </ButtonLink>
          <Button data-focus-return="add" onClick={() => openPanel({ kind: "add" }, "add")}>
            <PlusBoldIcon className="size-3.5" />
            Add guest
          </Button>
        </div>
      </div>

      <GuestStats summary={summary} />

      {noGuestsAtAll ? (
        <GuestEmptyState onAdd={() => openPanel({ kind: "add" }, "add")} />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          <GuestFilters
            query={query}
            eventId={filters.eventId}
            household={filters.household}
            events={events}
            households={households}
            onQuery={changeQuery}
            onEvent={(eventId) => apply({ ...filters, eventId: eventId || undefined, page: 1 })}
            onHousehold={(household) =>
              apply({ ...filters, household: household || undefined, page: 1 })
            }
          />

          {banner && (
            <FormBanner>
              <div className="flex items-start justify-between gap-3">
                <span>{banner}</span>
                <button
                  type="button"
                  onClick={() => void load(filters, { fresh: true })}
                  className="shrink-0 text-xs font-medium underline"
                >
                  Try again
                </button>
              </div>
            </FormBanner>
          )}

          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              pageCount={items.length}
              total={list.total}
              names={selectedNames}
              events={events}
              busy={bulkBusy}
              onApply={(mode, ids) => void applyBulk(mode, ids)}
              onDelete={() => setDeleting({ kind: "many", ids: [...selected] })}
              onClear={() => setSelected(new Set())}
            />
          )}

          <div
            aria-busy={loading}
            className={`overflow-hidden rounded-card border border-border bg-surface shadow-card transition-opacity ${
              loading ? "opacity-60" : ""
            }`}
          >
            {items.length === 0 ? (
              filtered ? (
                <NoMatchingGuests onClear={clearFilters} />
              ) : (
                <p className="px-6 py-14 text-center text-sm text-ink-secondary">
                  {loading ? "Loading guests…" : "No guests on this page."}
                </p>
              )
            ) : (
              <>
                <GuestTable {...listProps} />
                <GuestCards {...listProps} />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-secondary" aria-live="polite">
              {showingText(listPage, PAGE_SIZE, items.length, list.total)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filters.page <= 1 || loading}
                onClick={() => apply({ ...filters, page: filters.page - 1 })}
                className="flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-champagne disabled:pointer-events-none disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!list.nextCursor || loading}
                onClick={() => apply({ ...filters, page: filters.page + 1 })}
                className="flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-champagne disabled:pointer-events-none disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>

      {panel && (
        <GuestDrawer
          guest={panel.kind === "edit" ? panel.guest : undefined}
          events={events}
          households={households}
          onSaved={(saved) => {
            returnTo.current = panel.kind === "edit" ? saved.id : "add";
            setPanel(undefined);
            setNotice(panel.kind === "edit" ? `${saved.name} saved.` : `${saved.name} added.`);
            void refresh();
          }}
          onDelete={
            panel.kind === "edit"
              ? () => {
                  setDeleting({ kind: "one", guest: panel.guest });
                  setPanel(undefined);
                }
              : undefined
          }
          onClose={() => setPanel(undefined)}
        />
      )}

      {deleting && (
        <DeleteGuestModal
          {...(deleting.kind === "one"
            ? {
                kind: "one" as const,
                id: deleting.guest.id,
                name: deleting.guest.name,
                eventNames: guestEventNames(deleting.guest.eventIds, events),
              }
            : { kind: "many" as const, ids: deleting.ids })}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => {
            returnTo.current = "add";
            setDeleting(undefined);
            setSelected(new Set());
            setNotice(
              deleting.kind === "one" ? `${deleting.guest.name} deleted.` : "Guests deleted.",
            );
            void refresh();
          }}
        />
      )}
    </main>
  );
}
