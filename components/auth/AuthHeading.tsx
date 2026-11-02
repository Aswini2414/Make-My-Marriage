// The eyebrow, title and subtitle above an account form. The three variants carry the
// small spacing and size differences between the Stitch screens.

const variants = {
  login: {
    eyebrow: "mb-3 text-[11px] tracking-[0.18em]",
    title: "text-3xl text-plum sm:text-[38px]",
    subtitle: "mt-2 text-sm",
  },
  signup: {
    eyebrow: "mb-1.5 text-[11px] tracking-[0.16em]",
    title: "mb-1 text-[34px] text-plum",
    subtitle: "text-[13px]",
  },
  reset: {
    eyebrow: "mb-2 text-[11px] tracking-[0.18em]",
    title: "mb-2 text-3xl text-ink md:text-[34px]",
    subtitle: "text-sm",
  },
  invite: {
    eyebrow: "mb-1 text-xs tracking-widest",
    title: "mb-2 text-3xl text-ink",
    subtitle: "text-sm",
  },
} as const;

type Props = {
  variant: keyof typeof variants;
  eyebrow?: string;
  title: string;
  subtitle: string;
  /** Spacing below, which changes when an error banner follows. */
  className?: string;
};

export function AuthHeading({ variant, eyebrow, title, subtitle, className = "" }: Props) {
  const v = variants[variant];
  return (
    <div className={className}>
      {eyebrow && (
        <span className={`block font-semibold text-champagne-deep uppercase ${v.eyebrow}`}>
          {eyebrow}
        </span>
      )}
      <h1 className={`font-display leading-tight font-normal ${v.title}`}>{title}</h1>
      <p className={`leading-relaxed text-ink-secondary ${v.subtitle}`}>{subtitle}</p>
    </div>
  );
}
