"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  NavDashboardIcon,
  NavEventsIcon,
  NavGuestsIcon,
  NavInvitationsIcon,
  NavMembersIcon,
  NavMoneyIcon,
  NavPhotosIcon,
  NavTasksIcon,
  NavVendorsIcon,
  NavWebsiteIcon,
} from "@/components/icons";

const ITEMS: { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: NavDashboardIcon },
  { href: "/events", label: "Events", Icon: NavEventsIcon },
  { href: "/guests", label: "Guests", Icon: NavGuestsIcon },
  { href: "/invitations", label: "Invitations", Icon: NavInvitationsIcon },
  { href: "/money", label: "Money", Icon: NavMoneyIcon },
  { href: "/vendors", label: "Vendors", Icon: NavVendorsIcon },
  { href: "/tasks", label: "Tasks", Icon: NavTasksIcon },
  { href: "/website", label: "Website", Icon: NavWebsiteIcon },
  { href: "/photos", label: "Photos", Icon: NavPhotosIcon },
  { href: "/members", label: "Members", Icon: NavMembersIcon },
];

/** The sidebar links, as a column. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition-colors lg:py-2 ${
              active
                ? "bg-lilac font-medium text-plum shadow-2xs"
                : "font-normal text-ink/80 hover:bg-lilac/50 hover:text-plum"
            }`}
          >
            <Icon className={`size-4 ${active ? "text-plum" : "text-ink-secondary"}`} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
