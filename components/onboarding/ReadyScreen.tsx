import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { ButtonLink } from "@/components/Button";
import {
  CalendarOutlineIcon,
  ChevronRightOutlineIcon,
  PeopleOutlineIcon,
  PersonAddOutlineIcon,
} from "@/components/icons";
import { Monogram } from "@/components/Logo";

type Props = { bride: string; groom: string; dateText: string; daysText: string };

const actions: {
  href: string;
  title: string;
  text: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  {
    href: "/events",
    title: "Add your events",
    text: "Haldi, mehendi, sangeet, wedding and reception.",
    Icon: CalendarOutlineIcon,
  },
  {
    href: "/guests",
    title: "Add your guests",
    text: "Type them in or import a CSV or Excel file.",
    Icon: PeopleOutlineIcon,
  },
  {
    href: "/members",
    title: "Invite your family",
    text: "Bring in parents and siblings as Admins or Managers.",
    Icon: PersonAddOutlineIcon,
  },
];

/** Shown right after the wedding is created. */
export function ReadyScreen({ bride, groom, dateText, daysText }: Props) {
  return (
    <div className="w-full max-w-[520px] py-2 text-center">
      <Monogram tone="gold" className="mx-auto mb-5 size-14 text-2xl font-normal shadow-sm" />
      <h1 className="mb-2 font-display text-4xl font-normal text-ink">Your wedding is ready</h1>
      <p className="mb-1 text-sm font-medium text-plum">
        {bride} &amp; {groom} · {dateText} · {daysText}
      </p>
      <p className="mb-8 text-xs text-ink-secondary">Here’s a good place to start:</p>
      <ul className="mb-8 space-y-3 text-left">
        {actions.map(({ href, title, text, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:border-plum hover:shadow-md"
            >
              <span className="flex items-center gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-plum transition group-hover:bg-plum group-hover:text-surface">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink transition group-hover:text-plum">
                    {title}
                  </span>
                  <span className="block text-xs text-ink-secondary">{text}</span>
                </span>
              </span>
              <ChevronRightOutlineIcon className="size-4 shrink-0 text-mauve transition group-hover:translate-x-0.5 group-hover:text-plum" />
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink href="/dashboard" size="lg" className="w-full shadow-md">
        Go to dashboard
      </ButtonLink>
    </div>
  );
}
