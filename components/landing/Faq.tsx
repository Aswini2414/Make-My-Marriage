import { KeyboardArrowDownIcon } from "@/components/icons";

// Answers follow the PRD, not the Stitch placeholder copy (decided Oct 26, 2026).
const questions = [
  {
    q: "Is Make My Marriage free?",
    a: "Yes. Planning your wedding with Make My Marriage is free.",
  },
  {
    q: "Do our guests need to sign up?",
    a: "No. Each guest gets a private link to see their invitation and RSVP for each event, with no login. Photos are shared by scanning a QR code at the wedding.",
  },
  {
    q: "Who can see our expenses?",
    a: "Only the Admins and Managers of your wedding. Guests never see expenses, gifts or vendor quotes.",
  },
  {
    q: "Can both families plan together?",
    a: "Yes. Both sides can be invited with appropriate permission tiers so everyone stays in sync across venues and rituals.",
  },
  {
    q: "How do guests share photos?",
    a: "They scan the QR code for an event, or the one for the whole wedding, and upload from their phone with no login. You choose whether the gallery appears on your wedding website.",
  },
  {
    q: "What happens to our data after the wedding?",
    a: "Download your expenses and gifts as Excel files and every photo as a zip. When you delete your wedding, all its data is permanently removed.",
  },
];

/** Uses <details>, so it opens and closes without any JavaScript. */
export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24">
      <div className="mb-12 text-center">
        <span className="mb-2 block text-xs font-semibold tracking-[0.2em] text-champagne-deep uppercase">
          FAQ
        </span>
        <h2 className="text-4xl tracking-[-0.015em] text-ink md:text-5xl">Questions, answered.</h2>
      </div>

      <div className="divide-y divide-border rounded-2xl border-y border-border bg-surface px-6 shadow-sm sm:px-8">
        {questions.map(({ q, a }, i) => (
          <details key={q} className="group py-6" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between select-none [&::-webkit-details-marker]:hidden">
              <span className="text-base font-medium text-ink transition-colors group-hover:text-plum sm:text-lg">
                {q}
              </span>
              <span className="ml-3 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-ivory text-[18px] text-champagne-deep transition-transform duration-200 group-open:rotate-180">
                <KeyboardArrowDownIcon />
              </span>
            </summary>
            <p className="mt-3 pr-8 text-sm leading-relaxed text-ink-secondary">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
