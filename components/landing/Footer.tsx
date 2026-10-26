import { sectionLinks } from "@/components/landing/Header";
import { Logo } from "@/components/Logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-ivory-deep">
      <div className="mx-auto max-w-300 px-6 pt-16 pb-12 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="space-y-2">
            <Logo size="sm" />
            <p className="font-display text-base text-ink-secondary italic">
              Your wedding, beautifully in order.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-6 text-xs text-ink-secondary sm:gap-8"
          >
            {sectionLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-plum">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="mt-12 border-t border-border pt-6 text-xs text-ink-subtle">
          © {new Date().getFullYear()} Make My Marriage. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
