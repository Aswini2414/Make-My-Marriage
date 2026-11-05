import Link from "next/link";
import { MailIcon } from "@/components/icons";
import { invitesText } from "@/modules/dashboard/format";

/** Admins only: members who have been invited but have not joined yet. */
export function InvitesStrip({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-border/70 bg-lilac px-5 py-4 shadow-2xs">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface/80 text-plum">
          <MailIcon className="size-4" />
        </span>
        <p className="text-xs font-medium break-words text-ink">{invitesText(names)}</p>
      </div>
      <Link
        href="/members"
        className="inline-flex min-h-11 items-center text-xs font-semibold text-plum hover:underline"
      >
        Manage members
      </Link>
    </div>
  );
}
