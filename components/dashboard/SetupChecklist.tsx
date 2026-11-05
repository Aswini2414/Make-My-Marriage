import Link from "next/link";
import {
  CheckIcon,
  ChevronRightOutlineIcon,
  ChecklistIcon,
  NavEventsIcon,
  NavGuestsIcon,
  NavMembersIcon,
} from "@/components/icons";
import { type SetupItem, setupItems, showChecklist } from "@/modules/dashboard/format";
import type { Dashboard } from "@/modules/dashboard/types";

const icons: Record<SetupItem["key"], typeof NavEventsIcon> = {
  events: NavEventsIcon,
  tasks: ChecklistIcon,
  guests: NavGuestsIcon,
  team: NavMembersIcon,
};

/** "Let's set up your wedding": ticks off from real data, and goes away once all is done. */
export function SetupChecklist({ setup }: { setup: Dashboard["setup"] }) {
  const items = setupItems(setup);
  if (!showChecklist(items)) return null;

  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-8">
      <div className="max-w-2xl">
        <h2 className="font-display text-2xl text-ink lg:text-[26px]">Let’s set up your wedding</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
          Start with the essentials below. You can always update or invite co-planners anytime.
        </p>
      </div>
      <ul className="mt-6 divide-y divide-border/70">
        {items.map(({ key, href, title, text, action, done }) => {
          const Icon = icons[key];
          return (
            <li key={key}>
              <Link href={href} className="flex min-h-11 items-center justify-between gap-4 py-4">
                <span className="flex min-w-0 items-center gap-4">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                      done ? "bg-plum text-ivory" : "bg-lilac text-plum"
                    }`}
                  >
                    {done ? <CheckIcon className="size-5" /> : <Icon className="size-5" />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-semibold ${
                        done ? "text-ink-secondary line-through" : "text-ink"
                      }`}
                    >
                      {title}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-secondary">{text}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {!done && (
                    <span className="hidden rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-ink sm:inline">
                      {action}
                    </span>
                  )}
                  <ChevronRightOutlineIcon strokeWidth={2} className="size-4 text-ink-secondary" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
