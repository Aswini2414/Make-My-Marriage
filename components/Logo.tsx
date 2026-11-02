// The "Mm" monogram and the wordmark. Both use font-display, so they follow the page's fonts.

const tones = {
  light: "border-champagne bg-surface text-plum",
  /** Softer border, used in the landing page header. */
  soft: "border-champagne/70 bg-surface text-plum",
  tint: "border-champagne bg-champagne-tint text-plum",
  /** Champagne lettering, used on the wedding-ready screen. */
  gold: "border-champagne bg-ivory text-champagne",
  /** For plum backgrounds. */
  dark: "border-champagne bg-surface/5 text-champagne",
};

type MonogramProps = {
  tone?: keyof typeof tones;
  /** Size, text size and extras such as a shadow, e.g. "size-10 text-lg shadow-sm". */
  className: string;
};

export function Monogram({ tone = "light", className }: MonogramProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border font-display leading-none font-semibold italic ${tones[tone]} ${className}`}
    >
      Mm
    </span>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-3">
      {size === "md" ? (
        <Monogram tone="soft" className="size-10 text-lg tracking-tight shadow-sm" />
      ) : (
        <Monogram className="size-7 text-xs" />
      )}
      <span className="font-display text-2xl leading-none font-medium tracking-tight whitespace-nowrap text-ink">
        Make My Marriage
      </span>
    </span>
  );
}
