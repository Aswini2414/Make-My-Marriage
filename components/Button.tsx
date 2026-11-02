import Link from "next/link";
import type { ComponentProps } from "react";

// Pill buttons with single-line labels. Button is a <button>; ButtonLink navigates.

type Variant = "primary" | "secondary" | "outline";
type Size = "md" | "lg";

type StyleProps = { variant?: Variant; size?: Size; className?: string };

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "border-plum bg-plum text-ivory hover:bg-plum-hover",
  secondary: "border-border bg-surface text-ink hover:border-champagne",
  outline: "border-plum bg-transparent text-plum hover:bg-plum/5",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-8 text-sm",
};

function classes({ variant = "primary", size = "md", className }: StyleProps) {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={classes({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={classes({ variant, size, className })} {...props} />;
}
