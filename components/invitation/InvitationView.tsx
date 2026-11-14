"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDate, todayIST } from "@/lib/dates";
import {
  chooseAnswer,
  type Draft,
  draftFromEvents,
  eventCountText,
  firstName,
  type InvitationData,
  lastSavedDate,
  pageStateFor,
  reconcileDraft,
  saveErrorMessage,
  setHeadcount,
  shouldRefresh,
  showIncompleteBanner,
  toPayload,
  unanswered,
} from "@/modules/rsvp/page-state";
import { ClosedView } from "./ClosedView";
import { EventCard } from "./EventCard";
import { CoupleNames, CutoffLine, FormBanner, Monogram, SectionTitle, Wordmark } from "./parts";
import { RsvpCard } from "./RsvpCard";
import { ThankYou } from "./ThankYou";

type Props = {
  data: InvitationData;
  /** The wedding website, once it exists (Phase 7). Nothing is shown while this is empty. */
  websiteUrl?: string;
};

type Notice = { kind: "incomplete" } | { kind: "error"; message: string } | null;

/**
 * The whole guest page after the server has loaded the invitation: the form, the thank-you recap,
 * the edit form, or the read-only closed page. The token never reaches this component as a prop;
 * it is read from the address when needed.
 */
export function InvitationView({ data, websiteUrl }: Props) {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [view, setView] = useState<"form" | "thanks">(() =>
    pageStateFor(data) === "thanks" ? "thanks" : "form",
  );
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<Draft>(() => draftFromEvents(data.events));
  const [savedOn, setSavedOn] = useState<string | null>(() => lastSavedDate(data.events));
  const [draft, setDraft] = useState<Draft>(() => draftFromEvents(data.events));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showErrors, setShowErrors] = useState(false);
  // False while the server HTML is on screen and the page has not started in the browser yet. A
  // tap on Send before that would submit the form natively (a GET that reloads the page and loses
  // the answers), so the button waits.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // The invitation counts as opened when the guest's browser has loaded it, not when a server
  // renders it, so a mail scanner that only fetches the page does not mark guests as opened.
  // It is only reported when the server does not have it yet, and a failure is simply tried
  // again on the next visit.
  useEffect(() => {
    if (data.opened) return;
    fetch(`/api/public/invite/${token}/opened`, { method: "POST", cache: "no-store" }).catch(
      () => {},
    );
  }, [token, data.opened]);

  // Back to the top of the page whenever the screen changes (saved, edit, cancel), after React has
  // drawn the new one. Not on the first draw.
  const screen = `${view}:${editing}`;
  const shownScreen = useRef(screen);
  useEffect(() => {
    if (screen === shownScreen.current) return;
    shownScreen.current = screen;
    window.scrollTo({ top: 0 });
  }, [screen]);

  const { events } = data;
  const max = data.maxHeadcount;

  // The invitation changed under the page (the browser re-read it after a failed save): events
  // that are gone are dropped, new ones start unanswered, answers for the others are kept, and
  // the recap gives way to the form while an event has no saved answer.
  const eventIds = events.map((e) => e.id).join(",");
  const [seenEventIds, setSeenEventIds] = useState(eventIds);
  if (eventIds !== seenEventIds) {
    setSeenEventIds(eventIds);
    const nextSaved = reconcileDraft(events, saved);
    setSaved(nextSaved);
    setDraft((d) => reconcileDraft(events, d));
    if (view === "thanks" && unanswered(events, nextSaved).length > 0) {
      setEditing(false);
      setView("form");
    }
  }

  // The cut-off passed while the page was open (or the server says so after a refresh).
  if (!data.wedding.rsvpOpen) {
    return (
      <Page>
        <ClosedView data={data} websiteUrl={websiteUrl} />
      </Page>
    );
  }

  const missing = new Set(showErrors ? unanswered(events, draft) : []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const empty = unanswered(events, draft);
    if (empty.length > 0) {
      setShowErrors(true);
      setNotice({ kind: "incomplete" });
      // Move to the first event with no answer.
      document.getElementById(`answer-${empty[0]}-yes`)?.focus();
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/public/invite/${token}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(events, draft)),
      });
      if (res.ok) {
        setSaved(draft);
        setSavedOn(formatDate(todayIST()));
        setEditing(false);
        setShowErrors(false);
        setView("thanks");
        return;
      }
      const code = await res
        .json()
        .then((b: { error?: { code?: string } }) => b.error?.code)
        .catch(() => undefined);
      setNotice({ kind: "error", message: saveErrorMessage(code) });
      // The answers stay as they are; the page reads the invitation again if it has changed.
      if (shouldRefresh(code)) router.refresh();
    } catch {
      setNotice({ kind: "error", message: saveErrorMessage(undefined) });
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDraft(saved);
    setNotice(null);
    setShowErrors(false);
    setEditing(true);
    setView("form");
  }

  function cancelEdit() {
    setDraft(saved);
    setNotice(null);
    setShowErrors(false);
    setEditing(false);
    setView("thanks");
  }

  if (view === "thanks") {
    return (
      <Page center>
        <ThankYou data={data} saved={saved} websiteUrl={websiteUrl} onChange={startEdit} />
      </Page>
    );
  }

  const form = (
    <form onSubmit={submit} noValidate className="space-y-3.5 sm:space-y-3">
      {notice?.kind === "incomplete" && showIncompleteBanner(events, draft, showErrors) && (
        <FormBanner title="Incomplete reply">
          Please choose Attending or Not attending for all events below.
        </FormBanner>
      )}
      {notice?.kind === "error" && <FormBanner>{notice.message}</FormBanner>}
      {events.map((e) => (
        <RsvpCard
          key={e.id}
          event={e}
          answer={draft[e.id] ?? null}
          max={max}
          invalid={missing.has(e.id)}
          disabled={saving}
          onChoose={(attending) => setDraft((d) => chooseAnswer(d, e.id, attending))}
          onCount={(n) => setDraft((d) => setHeadcount(d, e.id, n, max))}
        />
      ))}
      <div className="space-y-3 pt-2 sm:pt-3">
        <CutoffLine cutoff={data.wedding.rsvpCutoffDate} />
        <button
          type="submit"
          disabled={saving || !ready}
          className="min-h-12 w-full rounded-full bg-plum px-6 py-3.5 text-xs font-medium tracking-wide text-surface shadow-sm transition-colors hover:bg-plum-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Send my reply"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="min-h-11 w-full text-xs font-medium text-ink-secondary transition-colors hover:text-plum disabled:opacity-60"
          >
            Cancel and keep current reply
          </button>
        )}
        <noscript>
          <p className="text-center text-[11px] text-ink-secondary">
            Please turn on JavaScript in your browser to send your reply.
          </p>
        </noscript>
        {!editing && websiteUrl && (
          <div className="pt-1 text-center">
            <a
              href={websiteUrl}
              className="inline-block py-2 text-xs text-ink-secondary hover:text-plum"
            >
              View wedding website
            </a>
          </div>
        )}
      </div>
    </form>
  );

  if (editing) {
    return (
      <Page>
        <div className="space-y-5">
          <header className="pt-2 text-center">
            <Monogram />
            <h1 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
              Edit your <span className="text-plum italic">reply</span>
            </h1>
            {savedOn && (
              <p className="mt-1 text-[11px] text-ink-secondary sm:text-xs">
                Your last reply was saved on {savedOn}.
              </p>
            )}
          </header>
          {form}
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="space-y-6 sm:space-y-8">
        <header className="space-y-2 text-center sm:space-y-2.5">
          <div className="pt-2 pb-4 sm:pb-0">
            <Monogram />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-ink-secondary uppercase sm:text-xs sm:tracking-[0.25em]">
            You are invited
          </p>
          <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            <CoupleNames data={data} />
          </h1>
          <p className="pt-0.5 text-xs text-ink-secondary">
            {formatDate(data.wedding.weddingDate)}
          </p>
          <div className="mx-auto my-3 h-px w-12 bg-champagne opacity-60 sm:w-16" />
          <p className="mx-auto max-w-md px-4 text-xs leading-relaxed text-ink-body sm:px-0">
            Dear <strong className="font-medium text-ink">{firstName(data.guest.name)}</strong>, we
            would be honoured to celebrate with you.
          </p>
        </header>

        {events.length === 0 ? (
          <p className="text-center text-xs text-ink-secondary">
            No events are listed on your invitation yet. Please contact the family.
          </p>
        ) : (
          <>
            <section className="space-y-3 sm:space-y-4" aria-labelledby="events-title">
              <SectionTitle
                id="events-title"
                plain="Your"
                italic="events"
                aside={eventCountText(events.length)}
              />
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </section>

            <section className="space-y-4" aria-labelledby="join-title">
              <SectionTitle id="join-title" plain="Will you" italic="join us?">
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Please let us know your plans for each event.
                </p>
              </SectionTitle>
              {form}
            </section>
          </>
        )}
      </div>
    </Page>
  );
}

/** The 580px reading column on a plain ivory page: no menu, no sidebar. */
function Page({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full max-w-[580px] flex-1 flex-col px-5 py-6 sm:px-8 sm:py-10 ${
        center ? "justify-center" : ""
      }`}
    >
      {children}
      <Wordmark />
    </main>
  );
}
