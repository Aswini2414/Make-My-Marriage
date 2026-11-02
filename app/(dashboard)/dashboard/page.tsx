import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import {
  ChevronRightOutlineIcon,
  ExternalLinkIcon,
  NavEventsIcon,
  NavGuestsIcon,
  NavMembersIcon,
  PlusBoldIcon,
} from "@/components/icons";
import { daysBetween, formatDateWithDay, greetingIST, todayIST } from "@/lib/dates";
import { pageMember } from "@/lib/page-access";

export const metadata: Metadata = { title: "Dashboard" };

const cardLabel = "text-[10px] font-semibold tracking-widest uppercase";

// Guests, money and tasks arrive in later phases, so their cards show the quiet empty state.
const emptyCards = [
  { label: "RSVP", note: "No guests yet" },
  { label: "Total spent", note: "No expenses yet", link: { href: "/money", text: "Open Money" } },
  { label: "Tasks", note: "No tasks yet" },
];

const setup = [
  {
    href: "/events",
    title: "Add your events",
    text: "Haldi, mehendi, sangeet, wedding and reception.",
    action: "Add events",
    Icon: NavEventsIcon,
  },
  {
    href: "/guests",
    title: "Add your guests",
    text: "Type them in or import a CSV or Excel file.",
    action: "Add guests",
    Icon: NavGuestsIcon,
  },
  {
    href: "/members",
    title: "Invite your family",
    text: "Bring in parents and siblings as Admins or Managers.",
    action: "Invite",
    Icon: NavMembersIcon,
  },
];

function countdown(days: number) {
  const n = Math.abs(days);
  if (days === 0) return { number: "0", label: "It’s today!" };
  const unit = n === 1 ? "day" : "days";
  return { number: String(n), label: days > 0 ? `${unit} to go` : `${unit} ago` };
}

export default async function DashboardPage() {
  const { user, member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding } = member!;
  const { number, label } = countdown(daysBetween(todayIST(), wedding.weddingDate));
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-ivory px-5 py-5 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs text-ink-secondary">
            {greetingIST()}, {firstName}
          </p>
          <h1 className="mt-0.5 font-display text-2xl leading-tight text-ink lg:text-[28px]">
            {wedding.brideName} &amp; {wedding.groomName}’s wedding
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${wedding.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-ink shadow-2xs transition-colors hover:bg-ivory"
          >
            <span>View website</span>
            <ExternalLinkIcon className="size-3.5 text-ink-secondary" />
          </Link>
          <ButtonLink href="/guests" className="h-auto gap-2 px-4 py-2 text-xs shadow-2xs">
            <PlusBoldIcon strokeWidth={2} className="size-3.5" />
            <span>Add guest</span>
          </ButtonLink>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-5 sm:p-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col justify-between rounded-card border border-plum bg-plum p-5 text-surface shadow-2xs">
            <div>
              <span className={`${cardLabel} text-champagne`}>Countdown</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl leading-none tracking-tight lg:text-[42px]">
                  {number}
                </span>
                <span className="text-xs text-surface/80">{label}</span>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-surface/70">
              {formatDateWithDay(wedding.weddingDate)}
            </p>
          </div>

          {emptyCards.map(({ label, note, link }) => (
            <div
              key={label}
              className="flex flex-col justify-between rounded-card border border-border bg-surface p-5 shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`${cardLabel} text-ink-secondary`}>{label}</span>
                  {link && (
                    <Link
                      href={link.href}
                      className="text-[11px] font-medium text-plum hover:underline"
                    >
                      {link.text}
                    </Link>
                  )}
                </div>
                <div className="mt-2">
                  <span className="font-display text-3xl leading-none text-ink-secondary/60 lg:text-[38px]">
                    —
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-border/40 pt-3 text-[11px] text-ink-secondary">
                {note}
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl text-ink lg:text-[26px]">
              Let’s set up your wedding
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Start with the essentials below. You can always update or invite co-planners anytime.
            </p>
          </div>
          <ul className="mt-6 divide-y divide-border/70">
            {setup.map(({ href, title, text, action, Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center justify-between gap-4 py-4">
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-plum">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{title}</span>
                      <span className="mt-0.5 block text-xs text-ink-secondary">{text}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-ink sm:inline">
                      {action}
                    </span>
                    <ChevronRightOutlineIcon
                      strokeWidth={2}
                      className="size-4 text-ink-secondary"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
