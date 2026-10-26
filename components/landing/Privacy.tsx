import type { ComponentType, SVGProps } from "react";
import { DeleteIcon, LockIcon, VisibilityIcon } from "@/components/icons";
import { PillEyebrow } from "@/components/landing/Eyebrow";

type Commitment = {
  title: string;
  text: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const commitments: Commitment[] = [
  {
    title: "Private workspace",
    text: "Only the people you invite can see your plans and expenses.",
    icon: LockIcon,
  },
  {
    title: "Guests see only their own events",
    text: "Each invitation shows just the ceremonies that guest is invited to.",
    icon: VisibilityIcon,
  },
  {
    title: "Delete means delete",
    text: "Remove your wedding and every guest detail and photo goes with it.",
    icon: DeleteIcon,
  },
];

export function Privacy() {
  return (
    <section className="mx-auto max-w-300 px-6 py-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <PillEyebrow>Private by default</PillEyebrow>
        <h2 className="mt-2 text-4xl tracking-[-0.015em] text-ink sm:text-5xl md:text-6xl">
          Your wedding stays yours.
        </h2>
      </div>

      <ul className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {commitments.map(({ title, text, icon: Icon }) => (
          <li
            key={title}
            className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm transition-all duration-300 hover:border-champagne/60"
          >
            <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-champagne/40 bg-champagne-tint text-[24px] text-champagne-deep">
              <Icon />
            </span>
            <h3 className="mb-2 text-2xl text-ink md:text-3xl">{title}</h3>
            <p className="text-[15px] leading-relaxed text-ink/80">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
