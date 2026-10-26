import { PillEyebrow } from "@/components/landing/Eyebrow";

const steps = [
  { title: "Create your wedding", text: "Add your names, date and events." },
  { title: "Bring your family in", text: "Invite parents, siblings and helpers to plan with you." },
  {
    title: "Send your invitations",
    text: "Email every guest their personal invitation and track RSVPs.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-300 scroll-mt-20 px-6 py-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <PillEyebrow>How it works</PillEyebrow>
        <h2 className="mt-2 text-4xl tracking-[-0.015em] text-ink sm:text-5xl md:text-6xl">
          Ready in an evening.
        </h2>
      </div>

      <ol className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="relative flex flex-col justify-start rounded-2xl border border-border bg-surface p-8 shadow-sm transition-all duration-300 hover:border-champagne/70"
          >
            <span
              aria-hidden="true"
              className="mb-6 block font-display text-5xl leading-none text-champagne md:text-6xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mb-2.5 text-2xl text-ink md:text-3xl">{step.title}</h3>
            <p className="text-[15px] leading-relaxed text-ink/80">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
