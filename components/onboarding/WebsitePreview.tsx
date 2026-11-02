import { ImageOutlineIcon, LinkOutlineIcon, PlusOutlineIcon } from "@/components/icons";

type Props = {
  bride: string;
  groom: string;
  /** The line under the names, or empty while no date is chosen. */
  dateLine?: string;
  daysLine?: string;
  address: string;
  /** "waiting" turns the dot amber: a name is still missing. */
  status: "live" | "waiting";
  coverNote: "none" | "awaiting";
};

function initials(bride: string, groom: string) {
  const b = bride.trim()[0]?.toUpperCase();
  const g = groom.trim()[0]?.toUpperCase();
  if (b && g) return `${b}&${g}`;
  return b ? `${b}.` : g ? `${g}.` : "Mm";
}

/** The small mock of the wedding website that follows what has been typed. */
export function WebsitePreview({
  bride,
  groom,
  dateLine,
  daysLine,
  address,
  status,
  coverNote,
}: Props) {
  const placeholder = "font-display text-mauve italic";
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-widest text-champagne-deep uppercase">
          Your wedding website preview
        </span>
        <span
          role="img"
          aria-label={status === "live" ? "Preview is up to date" : "Waiting for a name"}
          className={`size-2 rounded-full ${status === "live" ? "bg-success" : "bg-warning"}`}
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-ivory shadow-inner">
        <div className="flex h-32 items-center justify-center border-b border-border bg-lilac">
          <div className="text-center">
            {coverNote === "awaiting" ? (
              <span className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full bg-surface/70 text-plum-soft">
                <PlusOutlineIcon className="size-4" />
              </span>
            ) : (
              <ImageOutlineIcon className="mx-auto mb-1 size-6 text-plum-soft opacity-60" />
            )}
            <span className="text-[10px] text-ink-secondary">
              {coverNote === "awaiting" ? "Awaiting photo upload" : "No cover photo yet"}
            </span>
          </div>
        </div>
        <div className="p-5 text-center">
          <div className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full border border-champagne bg-surface">
            <span className="font-display text-[9px] text-plum italic">
              {initials(bride, groom)}
            </span>
          </div>
          <h3 className="mb-1 font-display text-2xl leading-snug text-ink">
            {bride.trim() || <span className={placeholder}>[Bride]</span>} &amp;{" "}
            {groom.trim() || <span className={placeholder}>[Groom]</span>}
          </h3>
          {dateLine ? (
            <>
              <p className="mb-1 text-xs font-medium text-plum">{dateLine}</p>
              <p className="mb-4 text-[11px] text-champagne-deep">{daysLine}</p>
            </>
          ) : (
            <p className="mb-4 text-xs text-ink-secondary italic">Date to be chosen</p>
          )}
          <div className="flex items-center justify-center gap-1.5 border-t border-lilac pt-3 text-[10px] text-ink-secondary">
            <LinkOutlineIcon className="size-3 shrink-0 text-champagne" />
            <span className="max-w-[220px] truncate font-mono text-[10px]">{address}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
