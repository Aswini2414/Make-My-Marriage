import { ButtonLink } from "@/components/Button";
import { ArrowDownwardIcon, ArrowForwardIcon, VerifiedIcon } from "@/components/icons";
import { DashboardPreview } from "@/components/landing/DashboardPreview";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-champagne)_15%,transparent)_0%,transparent_70%)] px-6 pt-16 pb-20 md:pt-24">
      {/* Soft champagne-to-lilac glow behind the headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-12 left-1/2 -z-10 h-[350px] w-[700px] -translate-x-1/2 rounded-full bg-linear-to-b/srgb from-champagne/10 via-lilac/40 to-transparent blur-3xl"
      />

      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-6 inline-flex items-center rounded-full border border-champagne/40 bg-surface/90 px-4 py-1.5 text-[10px] font-semibold tracking-[0.22em] text-champagne-deep uppercase shadow-[0_2px_10px_color-mix(in_srgb,var(--color-champagne)_12%,transparent)] md:text-xs">
          Wedding planning, reimagined
        </p>

        <h1 className="mx-auto max-w-4xl text-5xl leading-[1.04] tracking-[-0.015em] text-ink sm:text-6xl sm:leading-none md:text-7xl lg:text-[5.5rem]">
          Your wedding, <em className="text-plum">beautifully</em> in order.
        </h1>

        <p className="mx-auto mt-6 mb-10 max-w-2xl text-base leading-relaxed text-ink-secondary sm:text-lg sm:leading-7 md:text-xl">
          Events, guests, RSVPs, expenses and photos for your whole family, in one private
          workspace.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <ButtonLink
            href="/signup"
            size="lg"
            className="shadow-[0_8px_24px_color-mix(in_srgb,var(--color-plum)_22%,transparent)]"
          >
            Create your wedding
            <ArrowForwardIcon className="text-[15px] text-champagne" />
          </ButtonLink>
          <ButtonLink href="#how-it-works" variant="secondary" size="lg" className="shadow-sm">
            See how it works
            <ArrowDownwardIcon className="text-base text-ink-secondary" />
          </ButtonLink>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium tracking-wide text-champagne-deep">
          <VerifiedIcon className="text-[13px] text-champagne" />
          Free to use. No card needed.
        </p>
      </div>

      <DashboardPreview />
    </section>
  );
}
