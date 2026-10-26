import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { ArrowForwardIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";

export const sectionLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-ivory/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-300 items-center justify-between gap-4 px-6 sm:px-8">
        <Link href="/" aria-label="Make My Marriage home">
          <Logo />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-8 text-sm lg:flex">
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="py-1 whitespace-nowrap text-ink-secondary transition-colors hover:text-plum"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-secondary transition-colors hover:text-plum"
          >
            Log in
          </Link>
          {/* On phones the hero's own button is right below, so the header keeps only Log in. */}
          <span className="hidden sm:block">
            <ButtonLink
              href="/signup"
              className="shadow-[0_4px_16px_color-mix(in_srgb,var(--color-plum)_12%,transparent)]"
            >
              Create your wedding
              <ArrowForwardIcon className="text-[15px] text-champagne" />
            </ButtonLink>
          </span>
        </div>
      </div>
    </header>
  );
}
