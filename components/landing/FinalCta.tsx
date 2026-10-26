import Link from "next/link";
import { ArrowForwardIcon } from "@/components/icons";
import { Monogram } from "@/components/Logo";

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-plum px-6 py-28 text-center text-ivory">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_srgb,var(--color-champagne)_18%,transparent)_0%,transparent_60%)]"
      />
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center">
        <Monogram
          tone="dark"
          className="mb-6 size-16 text-2xl tracking-tight shadow-[0_0_20px_color-mix(in_srgb,var(--color-champagne)_20%,transparent)] backdrop-blur-sm"
        />
        <h2 className="mb-8 text-4xl leading-[1.08] tracking-[-0.015em] text-ivory sm:text-5xl sm:leading-none md:text-6xl lg:text-7xl">
          Begin planning your wedding today.
        </h2>
        {/* The "gold foil" pill from the Stitch design. */}
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-full bg-linear-135/srgb from-ivory to-pearl px-10 py-4 text-sm font-semibold tracking-wide text-plum shadow-[0_4px_20px_-2px_color-mix(in_srgb,var(--color-plum)_12%,transparent),inset_0_1px_1px_var(--color-surface),0_0_0_1px_color-mix(in_srgb,var(--color-champagne)_40%,transparent)] transition-all duration-300 hover:shadow-[0_8px_25px_-2px_color-mix(in_srgb,var(--color-plum)_18%,transparent),inset_0_1px_1px_var(--color-surface),0_0_0_1px_color-mix(in_srgb,var(--color-champagne)_70%,transparent)]"
        >
          Create your wedding
          <ArrowForwardIcon className="text-[17px] text-champagne-deep" />
        </Link>
        <p className="mt-6 text-xs font-light tracking-wider text-champagne-light/80">
          Free to use. Private by default.
        </p>
      </div>
    </section>
  );
}
