import type { ComponentType, SVGProps } from "react";
import {
  AccountBalanceWalletIcon,
  CalendarMonthIcon,
  CheckCircleIcon,
  DashboardIcon,
  EventIcon,
  GroupIcon,
  HourglassTopIcon,
  LockIcon,
  MailIcon,
  MoreHorizIcon,
  PhotoLibraryIcon,
  ShareIcon,
  StorefrontIcon,
} from "@/components/icons";
import { Monogram } from "@/components/Logo";

// A static picture of the dashboard for the landing page. Sample data only; nothing is
// interactive, so screen readers get one label instead of every number.

type NavItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  count?: string;
  countTone?: "lilac" | "success";
};

const nav: NavItem[] = [
  { label: "Events", icon: CalendarMonthIcon, count: "5", countTone: "lilac" },
  { label: "Guests", icon: GroupIcon, count: "412", countTone: "success" },
  { label: "Invitations", icon: MailIcon },
  { label: "Money", icon: AccountBalanceWalletIcon },
  { label: "Vendors", icon: StorefrontIcon },
  { label: "Tasks", icon: CheckCircleIcon },
  { label: "Photos", icon: PhotoLibraryIcon },
];

const events = [
  { name: "Haldi Ceremony", when: "Nov 26 • Courtyard Pavilion", time: "10:30 AM", guests: 180 },
  { name: "Mehendi Afternoon", when: "Nov 26 • Poolside Terrace", time: "03:00 PM", guests: 140 },
  { name: "Sangeet Celebration", when: "Nov 27 • Grand Ballroom", time: "07:00 PM", guests: 380 },
  {
    name: "The Wedding (Varmala & Phere)",
    when: "Nov 28 • The Mandap Grounds",
    time: "04:30 PM",
    guests: 412,
    main: true,
  },
  { name: "Formal Reception", when: "Nov 29 • Royal Lawns", time: "07:30 PM", guests: 450 },
];

const statLabel = "text-[10px] font-semibold tracking-[0.16em] uppercase";
const statNumber =
  "font-display text-2xl leading-none tracking-tight sm:text-3xl md:text-4xl md:leading-10";
const card = "rounded-card border border-border p-4 shadow-sm md:p-5";

export function DashboardPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the Make My Marriage dashboard for a sample wedding, showing the countdown, RSVPs, total spent, tasks and five events"
      className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-[0_25px_60px_-15px_color-mix(in_srgb,var(--color-plum)_14%,transparent)] md:mt-20"
    >
      {/* Browser bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-linear-to-r/srgb from-ivory via-ivory-deep/60 to-ivory px-4 py-3 sm:px-5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="size-3 rounded-full border border-error/20 bg-error/40" />
          <span className="size-3 rounded-full border border-warning/20 bg-warning/40" />
          <span className="size-3 rounded-full border border-success/20 bg-success/40" />
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-1.5 text-xs text-ink-secondary shadow-inner sm:px-6">
          <LockIcon className="shrink-0 text-sm text-champagne" />
          <span className="truncate">
            <span className="font-medium text-ink">make-my-marriage.vercel.app</span>
            <span className="hidden text-ink-subtle sm:inline">/w/radha-weds-krishna</span>
          </span>
          <span className="ml-1 size-1.5 shrink-0 rounded-full bg-success" />
        </div>
        <div className="hidden items-center gap-2 text-lg text-ink-subtle sm:flex">
          <ShareIcon />
          <MoreHorizIcon />
        </div>
      </div>

      <div className="flex min-h-[580px] bg-ivory">
        {/* Sidebar: hidden on phones, where the real app uses a menu button. */}
        <div className="hidden w-60 shrink-0 space-y-6 border-r border-border p-5 md:block">
          <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
            <Monogram className="size-9 text-base shadow-sm" />
            <span className="font-display text-base leading-tight font-semibold text-ink">
              Radha &amp; Krishna
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-plum px-3 py-2 font-medium text-ivory shadow-sm">
              <span className="flex items-center gap-2.5">
                <DashboardIcon className="text-[17px] text-champagne" />
                Dashboard
              </span>
              <span className="size-1.5 rounded-full bg-champagne" />
            </div>
            {nav.map(({ label, icon: Icon, count, countTone }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-ink-secondary"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="text-[17px]" />
                  {label}
                </span>
                {count && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      countTone === "success" ? "bg-success-bg text-success" : "bg-lilac text-plum"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className="min-w-0 flex-1 bg-surface p-5 md:p-8">
          <div className="border-b border-border pb-6">
            <p className="font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
              Radha &amp; Krishna
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-secondary">
              <EventIcon className="text-[13px] text-champagne" />
              November 28, 2026 • Jaipur &amp; Udaipur
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className={`${card} bg-linear-to-br/srgb from-champagne-tint to-lilac`}>
              <div className="flex items-center justify-between">
                <p className={`${statLabel} text-champagne-deep`}>Countdown</p>
                <HourglassTopIcon className="text-base text-champagne" />
              </div>
              <p className={`${statNumber} mt-2.5 text-plum`}>
                116{" "}
                <span className="font-sans text-xs font-medium tracking-normal text-ink-secondary">
                  days to go
                </span>
              </p>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-secondary">
                <span className="size-1 shrink-0 rounded-full bg-champagne" />
                Wedding ceremony in Jaipur
              </p>
            </div>

            <div className={`${card} bg-surface`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`${statLabel} text-ink-secondary`}>RSVP Status</p>
                <span className="rounded bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success">
                  63% In
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className={`${statNumber} text-ink`}>260</p>
                  <p className="mt-0.5 text-[11px] text-ink-secondary">Attending</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-ink">412 invited</p>
                  <p className="mt-0.5 text-[11px] font-medium text-champagne-deep">122 pending</p>
                </div>
              </div>
            </div>

            <div className={`${card} bg-surface`}>
              <p className={`${statLabel} text-ink-secondary`}>Total spent</p>
              <p className={`${statNumber} mt-2.5 text-plum`}>₹12,50,000</p>
            </div>

            <div className={`${card} bg-surface`}>
              <p className={`${statLabel} text-ink-secondary`}>Tasks</p>
              <p className={`${statNumber} mt-2.5 text-ink`}>
                30 of 48{" "}
                <span className="font-sans text-xs font-normal tracking-normal text-ink-secondary">
                  done
                </span>
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-lilac">
                <div className="h-full w-[62.5%] rounded-full bg-plum" />
              </div>
            </div>
          </div>

          <div className={`${card} mt-5 bg-surface md:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <p className="flex items-center gap-2 font-display text-2xl text-ink">
                Scheduled Ceremonies
                <span className="size-1.5 rounded-full bg-champagne" />
              </p>
              <span className="rounded-full border border-champagne/40 bg-champagne-tint px-3 py-1 text-xs font-semibold tracking-wider text-champagne-deep uppercase">
                5 Events Confirmed
              </span>
            </div>
            <div className="divide-y divide-border text-xs">
              {events.map((event) => (
                <div
                  key={event.name}
                  className={`flex items-center justify-between gap-3 rounded-lg px-2 py-3 ${
                    event.main ? "bg-champagne-tint/40" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <span
                      className={`text-sm text-ink ${event.main ? "font-semibold" : "font-medium"}`}
                    >
                      {event.name}
                    </span>
                    <span
                      className={`block text-xs lg:ml-2 lg:inline ${
                        event.main ? "font-medium text-champagne-deep" : "text-ink-secondary"
                      }`}
                    >
                      {event.when}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span
                      className={`hidden font-mono text-[11px] leading-4 sm:inline ${
                        event.main ? "font-medium text-plum" : "text-ink-secondary"
                      }`}
                    >
                      {event.time}
                    </span>
                    <span
                      className={
                        event.main ? "font-semibold text-plum" : "font-medium text-ink-secondary"
                      }
                    >
                      {event.guests} guests
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
