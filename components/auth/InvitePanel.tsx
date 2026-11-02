import { formatDate } from "@/lib/dates";

type Props = {
  weddingName: string;
  /** YYYY-MM-DD */
  weddingDate: string;
  invitedBy: string;
  role: "admin" | "manager";
  /** An expired invite is shown faded. */
  faded?: boolean;
};

const ROLE_TEXT = {
  admin: "Admins can do everything Managers can, and also add or remove members and change roles.",
  manager: "Managers can plan events, guests, invitations, money, vendors, tasks and photos.",
};

/** The plum side of the accept-invite page: a small card describing the invitation. */
export function InvitePanel({ weddingName, weddingDate, invitedBy, role, faded }: Props) {
  return (
    <>
      <div
        className={`rounded-2xl border bg-ivory p-7 text-ink lg:p-8 ${
          faded ? "border-champagne/30 opacity-50 grayscale-[20%]" : "border-champagne/40 shadow-sm"
        }`}
      >
        <span className="mb-2.5 block text-[11px] font-semibold tracking-widest text-champagne-deep uppercase">
          You’re invited to help plan
        </span>
        <p className="font-display text-3xl leading-snug text-ink">{weddingName}</p>
        <p className="mt-1 text-sm text-ink-secondary">{formatDate(weddingDate)}</p>
        <div className="my-5 w-full border-t border-champagne/30" />
        <div className="flex items-center justify-between py-0.5 text-sm">
          <span className="text-ink-secondary">Invited by</span>
          <span className="font-medium text-ink">{invitedBy}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-sm">
          <span className="text-ink-secondary">Your role</span>
          <span className="rounded-full bg-plum px-3 py-1 text-xs font-medium tracking-wide text-ivory capitalize">
            {role}
          </span>
        </div>
      </div>
      <p
        className={`mt-4 max-w-sm px-1 text-xs leading-relaxed ${faded ? "text-ivory/40" : "text-ivory/70"}`}
      >
        {ROLE_TEXT[role]}
      </p>
    </>
  );
}
