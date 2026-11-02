import Link from "next/link";
import { Monogram } from "@/components/Logo";
import { formatShortDate } from "@/lib/dates";
import { MobileNav } from "./MobileNav";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

type Props = {
  bride: string;
  groom: string;
  weddingDate: string;
  user: { name: string; email: string };
  role: "admin" | "manager";
};

/**
 * The left column of every logged-in page: the couple, the sections and the signed-in
 * person. Below the desktop width it becomes a top bar with a drawer (MobileNav).
 */
export function Sidebar({ bride, groom, weddingDate, user, role }: Props) {
  return (
    <>
      <MobileNav title={`${bride} & ${groom}`} user={user} role={role} />
      <aside className="hidden shrink-0 flex-col bg-ivory select-none lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:justify-between lg:border-r lg:border-border">
        <div>
          <div className="border-b border-border/60 p-5 pb-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Monogram className="size-9 shrink-0 text-lg font-normal tracking-tight shadow-2xs" />
              <span className="min-w-0">
                <span className="line-clamp-3 block font-display text-[20px] leading-tight break-words text-plum">
                  {bride} &amp; {groom}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-secondary">
                  {formatShortDate(weddingDate)}
                </span>
              </span>
            </Link>
          </div>
          <SidebarNav />
        </div>
        <UserMenu name={user.name} email={user.email} role={role} />
      </aside>
    </>
  );
}
