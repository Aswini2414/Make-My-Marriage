import { LockIcon } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import { closedLine, type InvitationData } from "@/modules/rsvp/page-state";
import { EventCard } from "./EventCard";
import { CoupleNames, Monogram, SectionTitle } from "./parts";

/** After the cut-off: nothing can be changed. Shows the saved reply (if any) and the events. */
export function ClosedView({ data, websiteUrl }: { data: InvitationData; websiteUrl?: string }) {
  const answered = data.events.filter((e) => e.rsvp);
  const cutoff = data.wedding.rsvpCutoffDate;
  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="space-y-1 pt-2 text-center">
        <Monogram />
        <p className="mt-2 text-[11px] font-semibold tracking-widest text-ink-secondary uppercase sm:text-xs">
          Wedding invitation
        </p>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          <CoupleNames data={data} />
        </h1>
        <p className="text-xs text-ink-secondary">{formatDate(data.wedding.weddingDate)}</p>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-plum/10 bg-lilac/70 p-3.5">
        <LockIcon className="mt-0.5 shrink-0 text-base text-plum" />
        <p className="text-xs leading-relaxed text-plum">
          {cutoff ? (
            <>
              Replies closed on <span className="font-semibold">{formatDate(cutoff)}</span>.
            </>
          ) : (
            "Replies are closed."
          )}{" "}
          To change your answer, please contact the family.
        </p>
      </div>

      <section className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="font-display text-lg text-ink sm:text-xl">
          Your <span className="italic">saved reply</span>
        </h2>
        {answered.length === 0 ? (
          <p className="text-xs text-ink-secondary">
            No reply was recorded. Please contact the family.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 text-xs">
            {answered.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 font-medium break-words text-ink">{e.name}</span>
                <span
                  className={`shrink-0 text-right font-medium ${
                    e.rsvp!.attending ? "text-plum" : "text-ink-secondary"
                  }`}
                >
                  {closedLine(e.rsvp!)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.events.length > 0 && (
        <section className="space-y-3">
          <SectionTitle plain="Your" italic="itinerary" />
          {data.events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </section>
      )}

      {websiteUrl && (
        <div className="text-center">
          <a href={websiteUrl} className="text-xs text-ink-secondary hover:text-plum">
            View wedding website
          </a>
        </div>
      )}
    </div>
  );
}
