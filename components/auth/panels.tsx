import { CheckIcon } from "@/components/icons";

// The text on the plum side of each account page. Wording follows the Stitch designs.

/** "Your wedding, beautifully in order." with the middle word in italics. */
function PitchHeading({ className }: { className: string }) {
  return (
    <h2 className={`flex flex-col font-display font-normal tracking-tight text-ivory ${className}`}>
      <span>Your wedding,</span>
      <span>
        <em>beautifully</em> in order.
      </span>
    </h2>
  );
}

export function LoginPanel() {
  return (
    <>
      <PitchHeading className="gap-2 text-3xl leading-9 sm:text-4xl sm:leading-10 lg:text-[46px]" />
      <p className="mt-4 text-base leading-relaxed font-normal text-ivory/70 md:text-[17px]">
        Pick up right where your family left off.
      </p>
      {/* A quiet preview of the product. It is a sample, not real data. */}
      <div className="mt-10 max-w-85 rounded-card border border-border bg-ivory p-5 text-ink shadow-[0_16px_36px_-12px_color-mix(in_srgb,var(--color-black)_35%,transparent)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-champagne" />
            <span className="font-display text-lg font-medium text-plum">Radha &amp; Krishna</span>
          </div>
          <span className="text-xs font-medium tracking-tight text-ink-secondary">
            116 days to go
          </span>
        </div>
        <div className="my-3 h-px bg-champagne/30" />
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-ink-secondary">
            <span className="font-medium text-ink">Sangeet</span>
            <span>Nov 27</span>
          </div>
          <div className="flex items-center justify-between text-ink-secondary">
            <span className="font-medium text-ink">Reception</span>
            <span>Nov 29</span>
          </div>
        </div>
      </div>
    </>
  );
}

const SIGNUP_POINTS = [
  "Events, guests and RSVPs",
  "Invitations to every guest",
  "Expenses, gifts, tasks and photos",
];

export function SignupPanel() {
  return (
    <>
      <h2 className="mb-8 font-display text-3xl leading-[1.12] font-normal tracking-tight text-ivory sm:text-4xl lg:text-[44px]">
        <span className="block">Plan every ceremony</span>
        <span className="block">
          in one <em>calm</em> place.
        </span>
      </h2>
      <ul className="mb-8 space-y-4">
        {SIGNUP_POINTS.map((point) => (
          <li key={point} className="flex items-center gap-3.5 text-sm text-ivory/90">
            <CheckIcon className="shrink-0 text-base text-champagne" />
            {point}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-ivory/70">Free to use. No card needed.</p>
    </>
  );
}

/** Forgot-password and reset-password. */
export function ResetPanel() {
  return (
    <>
      <PitchHeading className="text-3xl leading-[1.15] sm:text-4xl lg:text-[44px]" />
      <p className="mt-5 text-sm leading-relaxed text-ivory/70">
        We&apos;ll get you back to your plans in a minute.
      </p>
    </>
  );
}
