import type { ReactNode } from "react";
import { ErrorIcon } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import type { InvitationData } from "@/modules/rsvp/page-state";

// Small pieces shared by the guest invitation page's screens.

/** The round "Mm" mark at the top of every screen. */
export function Monogram() {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-surface font-display text-sm font-semibold tracking-tighter text-plum sm:size-9 sm:text-base">
      Mm
    </span>
  );
}

/** The footer: a quiet wordmark, nothing else. */
export function Wordmark() {
  return <p className="pt-8 text-center text-[11px] text-ink-secondary">Make My Marriage</p>;
}

/** "Radha & *Krishna*": the second name in italic plum. */
export function CoupleNames({ data }: { data: InvitationData }) {
  return (
    <>
      {data.wedding.brideName} &amp;{" "}
      <span className="text-plum italic">{data.wedding.groomName}</span>
    </>
  );
}

/** "You can change your answers until 20 January 2027." Nothing when there is no cut-off. */
export function CutoffLine({ cutoff }: { cutoff: string | null }) {
  if (!cutoff) return null;
  return (
    <p className="text-center text-[11px] text-ink-secondary sm:text-xs">
      You can change your answers until{" "}
      <span className="font-medium text-ink">{formatDate(cutoff)}</span>.
    </p>
  );
}

/** A section title with an italic last word: "Your *events*". */
export function SectionTitle({
  id,
  plain,
  italic,
  aside,
  children,
}: {
  id?: string;
  plain: string;
  italic: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-1 sm:border-b sm:border-border sm:px-0 sm:pb-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="font-display text-lg text-ink sm:text-xl">
          {plain} <span className="italic">{italic}</span>
        </h2>
        {aside && <span className="text-[11px] text-ink-secondary sm:text-xs">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** The muted-error summary shown above the form, and for a failed save. */
export function FormBanner({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card border border-error-border bg-error-bg p-3.5"
    >
      <ErrorIcon className="mt-0.5 shrink-0 text-base text-error" />
      <div className="min-w-0 text-xs text-error">
        {title && <span className="block font-semibold">{title}</span>}
        {children}
      </div>
    </div>
  );
}
