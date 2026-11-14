import { CheckIcon } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import { type Draft, firstName, type InvitationData, recapLine } from "@/modules/rsvp/page-state";
import { CutoffLine } from "./parts";

type Props = {
  data: InvitationData;
  saved: Draft;
  websiteUrl?: string;
  onChange: () => void;
};

/** After a save, and for a guest who already replied: what they answered, and a way to change it. */
export function ThankYou({ data, saved, websiteUrl, onChange }: Props) {
  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm sm:space-y-6 sm:p-8">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-lilac sm:size-16">
        <CheckIcon className="text-3xl text-plum" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Thank you, <span className="text-plum italic">{firstName(data.guest.name)}</span>
        </h1>
        <p className="text-xs text-ink-secondary sm:text-sm">Your reply has been saved.</p>
      </div>

      <ul className="space-y-3 border-y border-border py-4 text-left">
        {data.events.map((e) => {
          const a = saved[e.id];
          if (!a) return null;
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <span className="block font-medium break-words text-ink">{e.name}</span>
                <span className="text-[11px] text-ink-secondary">{formatDate(e.date)}</span>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  a.attending
                    ? "bg-lilac text-plum"
                    : "border border-border bg-ivory text-ink-secondary"
                }`}
              >
                {recapLine(a)}
              </span>
            </li>
          );
        })}
      </ul>

      <CutoffLine cutoff={data.wedding.rsvpCutoffDate} />

      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={onChange}
          className="min-h-12 w-full rounded-full border border-plum px-5 py-3 text-xs font-medium text-plum transition-colors hover:bg-lilac/50"
        >
          Change my answers
        </button>
        {websiteUrl && (
          <a
            href={websiteUrl}
            className="inline-block py-2 text-xs text-ink-secondary transition-colors hover:text-plum"
          >
            View wedding website
          </a>
        )}
      </div>
    </div>
  );
}
