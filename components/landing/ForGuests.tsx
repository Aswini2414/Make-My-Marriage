import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  CelebrationIcon,
  CheckIcon,
  LocalFloristIcon,
  RestaurantIcon,
  TempleHinduIcon,
  UploadIcon,
} from "@/components/icons";
import { PillEyebrow } from "@/components/landing/Eyebrow";
import { Monogram } from "@/components/Logo";

const points = [
  { title: "Open a personal invitation", text: "Shows only the events they're invited to" },
  {
    title: "RSVP for each event in seconds",
    text: "Yes or no, and how many are coming, per event",
  },
  { title: "Scan a QR code to share photos", text: "Photos go straight into your shared gallery" },
];

type Tile = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
};

const tiles: Tile[] = [
  {
    label: "Mandap decor",
    icon: LocalFloristIcon,
    className: "from-lilac to-champagne-tint text-champagne",
  },
  {
    label: "Sangeet lights",
    icon: CelebrationIcon,
    className: "from-champagne-tint to-sand text-champagne-deep",
  },
  { label: "Palace setup", icon: TempleHinduIcon, className: "from-mist to-linen text-plum" },
  { label: "Banquets", icon: RestaurantIcon, className: "from-ivory to-heather text-champagne" },
];

/** A phone outline for the mockups. Pictures only: screen readers get the label. */
function Phone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative w-72 rounded-[40px] border-4 border-plum bg-ink p-2.5 shadow-[0_25px_50px_-12px_color-mix(in_srgb,var(--color-plum)_22%,transparent)] transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative mx-auto mb-2 flex h-4 w-20 items-center justify-center rounded-full bg-black">
        <span className="absolute right-3 size-2 rounded-full bg-plum" />
      </div>
      <div className="flex min-h-[460px] flex-col justify-between rounded-[32px] border border-border bg-surface p-5">
        {children}
      </div>
    </div>
  );
}

/** Looks like the phone's primary button, but it's part of the picture. */
function PhoneButton({ children }: { children: ReactNode }) {
  return (
    <div className="pt-2">
      <span className="flex w-full items-center justify-center gap-1.5 rounded-full bg-plum py-3 text-xs font-semibold text-ivory shadow-md">
        {children}
      </span>
    </div>
  );
}

export function ForGuests() {
  return (
    <section id="guest-experience" className="relative border-y border-border bg-lilac py-24">
      <div className="mx-auto grid max-w-300 grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <PillEyebrow soft>For your guests</PillEyebrow>
          <h2 className="mt-2 mb-6 text-4xl leading-[1.08] tracking-[-0.015em] text-ink sm:text-5xl sm:leading-none md:text-[3.5rem]">
            No app. No account. <em className="text-plum">Just a link.</em>
          </h2>
          <p className="mb-8 text-sm leading-relaxed text-ink-secondary md:text-base md:leading-6">
            Grandparents, out-of-town guests and NRI family see their invitation, venue and timings
            in one link.
          </p>
          <ul className="space-y-4">
            {points.map((point) => (
              <li
                key={point.title}
                className="flex items-start gap-3.5 rounded-xl border border-border bg-surface/70 p-3.5"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-plum text-[14px] text-ivory shadow-sm">
                  <CheckIcon />
                </span>
                <div>
                  <span className="block text-sm font-medium text-ink">{point.title}</span>
                  <span className="text-xs text-ink-secondary">{point.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 lg:col-span-7">
          <Phone label="A guest's invitation on a phone, listing the Sangeet and the Wedding with an RSVP button">
            <div className="border-b border-border pb-4 text-center">
              <Monogram tone="tint" className="mx-auto mb-2 size-10 text-sm" />
              <span className="block text-[9px] font-semibold tracking-widest text-champagne-deep uppercase">
                Cordially Invited
              </span>
              <p className="mt-1 font-display text-2xl text-ink">Radha &amp; Krishna</p>
              <p className="mt-0.5 text-[10px] text-ink-secondary">Jai Mahal Palace • Jaipur</p>
            </div>
            <div className="space-y-2.5 py-3">
              <div className="rounded-xl border border-border bg-ivory p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold tracking-wider text-champagne uppercase">
                    Ceremony 1
                  </span>
                  <span className="rounded-full bg-lilac px-2 py-0.5 text-[9px] font-medium text-plum">
                    Invited
                  </span>
                </div>
                <p className="mt-0.5 font-display text-base font-semibold text-ink">
                  Sangeet Evening
                </p>
                <p className="text-[11px] text-ink-secondary">Friday • Nov 27 • 7:00 PM</p>
              </div>
              <div className="rounded-xl border border-champagne/30 bg-champagne-tint/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold tracking-wider text-champagne-deep uppercase">
                    Ceremony 2
                  </span>
                  <span className="rounded-full bg-plum px-2 py-0.5 text-[9px] font-medium text-ivory">
                    Main
                  </span>
                </div>
                <p className="mt-0.5 font-display text-base font-semibold text-ink">The Wedding</p>
                <p className="text-[11px] text-ink-secondary">Saturday • Nov 28 • 4:00 PM</p>
              </div>
            </div>
            <PhoneButton>
              RSVP Now
              <CheckIcon className="text-[13px] text-champagne" />
            </PhoneButton>
          </Phone>

          <Phone label="The shared photo gallery on a phone, with 142 photos and a Choose photos button">
            <div className="border-b border-border pb-3 text-center">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold tracking-widest text-champagne-deep uppercase">
                  Wedding Moments
                </span>
                <span className="rounded-full border border-border bg-ivory px-2 py-0.5 text-[9px] font-medium text-ink-secondary">
                  142 photos
                </span>
              </div>
              <p className="mt-1 font-display text-2xl text-ink">Shared Memories</p>
            </div>
            <div className="grid grid-cols-2 gap-2 py-3">
              {tiles.map(({ label, icon: Icon, className }) => (
                <div
                  key={label}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border border-border bg-linear-to-tr/srgb p-2 text-center ${className}`}
                >
                  <Icon className="mb-1 text-[20px]" />
                  <span className="text-[9px] text-ink-secondary">{label}</span>
                </div>
              ))}
            </div>
            <PhoneButton>
              <UploadIcon className="text-[15px] text-champagne" />
              Choose photos
            </PhoneButton>
          </Phone>
        </div>
      </div>
    </section>
  );
}
