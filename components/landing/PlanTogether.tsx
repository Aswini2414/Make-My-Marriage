import { GroupWorkIcon } from "@/components/icons";

const roles = [
  { name: "Admin", text: "invites and manages family members" },
  { name: "Manager", text: "helps plan everything else" },
];

export function PlanTogether() {
  return (
    <section className="mx-auto max-w-300 px-6 py-12">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-linear-to-b/srgb from-lilac to-ivory p-8 text-center shadow-sm sm:p-12 md:p-16">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-champagne/40 bg-surface/90 px-3 py-1">
          <GroupWorkIcon className="text-[14px] text-champagne" />
          <span className="text-[10px] font-semibold tracking-widest text-champagne-deep uppercase">
            Role-Based Access
          </span>
        </p>
        <h2 className="mb-4 text-3xl tracking-[-0.015em] text-ink sm:text-4xl md:text-5xl">
          Plan together, without the chaos.
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-ink-secondary md:text-lg md:leading-7">
          Admins manage who&apos;s in. Managers help with everything else. Everyone sees the same
          plan.
        </p>
        <div className="mx-auto flex max-w-xl flex-col items-stretch justify-center gap-4 sm:flex-row">
          {roles.map((role) => (
            <div
              key={role.name}
              className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-border bg-surface/90 px-5 py-3 text-xs text-ink"
            >
              <span className="font-semibold text-plum">{role.name}:</span>
              <span className="text-ink-secondary">{role.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
