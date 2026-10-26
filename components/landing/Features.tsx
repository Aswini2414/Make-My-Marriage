import type { ComponentType, SVGProps } from "react";
import {
  BadgeIcon,
  CalendarTodayIcon,
  ChecklistIcon,
  MarkEmailReadIcon,
  PaymentsIcon,
  PhotoCameraIcon,
} from "@/components/icons";
import { Eyebrow } from "@/components/landing/Eyebrow";

type Feature = {
  title: string;
  text: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const features: Feature[] = [
  {
    title: "Events",
    text: "Haldi to reception, each with its own date, venue, dress code and map.",
    icon: CalendarTodayIcon,
  },
  {
    title: "Guests and RSVP",
    text: "One guest list. Personal invitations. Live headcounts for every event.",
    icon: MarkEmailReadIcon,
  },
  {
    title: "Money",
    text: "Log every expense and gift, and see what's been spent at a glance.",
    icon: PaymentsIcon,
  },
  {
    title: "Vendors",
    text: "Find vendors, save quotes and keep every contact in one list.",
    icon: BadgeIcon,
  },
  {
    title: "Tasks",
    text: "Assign to-dos to family members and see what's done and what's late.",
    icon: ChecklistIcon,
  },
  {
    title: "Website and photos",
    text: "A wedding website with a live stream, and a shared photo gallery.",
    icon: PhotoCameraIcon,
  },
];

/** The "before and after" strip between the hero and the features. */
export function CalmBand() {
  return (
    <section className="border-y border-border bg-lilac py-8">
      <p className="mx-auto flex max-w-300 flex-wrap items-center justify-center gap-3 px-6 text-center text-base text-ink sm:text-lg md:gap-4 md:text-xl">
        <span className="text-ink-secondary line-through decoration-champagne/70 decoration-1">
          WhatsApp groups, notebooks and spreadsheets
        </span>
        <span aria-hidden="true" className="font-display text-2xl text-champagne italic">
          →
        </span>
        <span className="font-display text-2xl text-plum italic md:text-3xl">
          one calm, private workspace.
        </span>
      </p>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-300 scroll-mt-20 px-6 py-24">
      <div className="mb-14 max-w-2xl">
        <Eyebrow>Everything in one place</Eyebrow>
        <h2 className="text-4xl leading-[1.08] tracking-[-0.015em] text-ink sm:text-5xl sm:leading-none md:text-6xl">
          Plan every ceremony with <em className="text-plum">less stress</em>.
        </h2>
      </div>

      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ title, text, icon: Icon }) => (
          <li
            key={title}
            className="group rounded-2xl border border-border bg-surface p-8 transition-all duration-300 hover:border-champagne/60 hover:shadow-[0_12px_32px_-6px_color-mix(in_srgb,var(--color-plum)_8%,transparent)]"
          >
            <span className="mb-6 flex size-12 items-center justify-center rounded-xl border border-border bg-ivory text-[22px] text-plum shadow-sm transition-colors group-hover:border-champagne/50 group-hover:bg-lilac">
              <Icon />
            </span>
            <h3 className="mb-2.5 text-2xl text-ink transition-colors group-hover:text-plum md:text-3xl">
              {title}
            </h3>
            <p className="text-[15px] leading-relaxed text-ink/80">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
