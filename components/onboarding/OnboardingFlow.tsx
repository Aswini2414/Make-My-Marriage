"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { TextField } from "@/components/form/TextField";
import { CalendarOutlineIcon, ImageOutlineIcon, InfoOutlineIcon } from "@/components/icons";
import { fieldErrors, postJson } from "@/lib/api-client";
import { daysBetween, daysToGoText, formatDate, formatDateWithDay } from "@/lib/dates";
import { brideName, createWeddingSchema, groomName, weddingDate } from "@/modules/weddings/schema";
import { baseSlug } from "@/modules/weddings/slug";
import { DatePicker } from "@/components/form/DatePicker";
import { ReadyScreen } from "./ReadyScreen";
import { Stepper } from "./Stepper";
import { WebsitePreview } from "./WebsitePreview";

type Step = 1 | 2 | 3 | "ready";
type Errors = Record<string, string>;

const actionLink = "tap-area text-sm font-medium text-plum hover:underline";
const secondaryButton = "h-11 px-6 shadow-none";
const primaryButton = "h-11 px-8 shadow-sm";

export function OnboardingFlow({ siteHost, today }: { siteHost: string; today: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [bride, setBride] = useState("");
  const [groom, setGroom] = useState("");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string>();
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Moving to a new step moves the screen reader and keyboard to its heading.
  useEffect(() => heading.current?.focus(), [step]);

  const address = `${siteHost}/w/${baseSlug(bride, groom)}`;
  const addressText = bride.trim() || groom.trim() ? address : `${siteHost}/w/your-names`;
  const days = date ? daysBetween(today, date) : 0;
  const preview = (coverNote: "none" | "awaiting") => (
    <WebsitePreview
      bride={bride}
      groom={groom}
      dateLine={date ? formatDateWithDay(date) : undefined}
      daysLine={date ? daysToGoText(days) : undefined}
      address={addressText}
      status={bride.trim() && groom.trim() ? "live" : "waiting"}
      coverNote={coverNote}
    />
  );

  function goTo(next: Step) {
    setBanner(undefined);
    setErrors({});
    setStep(next);
  }

  function continueFromCouple(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    const b = brideName.safeParse(bride);
    const g = groomName.safeParse(groom);
    if (!b.success) found.brideName = b.error.issues[0]!.message;
    if (!g.success) found.groomName = g.error.issues[0]!.message;
    if (found.brideName || found.groomName) return setErrors(found);
    goTo(2);
  }

  function continueFromDate(event: FormEvent) {
    event.preventDefault();
    const parsed = weddingDate.safeParse(date);
    if (!parsed.success) return setErrors({ weddingDate: parsed.error.issues[0]!.message });
    goTo(3);
  }

  async function create(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current) return;
    const parsed = createWeddingSchema.safeParse({
      brideName: bride,
      groomName: groom,
      weddingDate: date,
    });
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      return (
        setErrors(found),
        setStep(found.weddingDate && !found.brideName && !found.groomName ? 2 : 1)
      );
    }
    busy.current = true;
    setPending(true);
    setBanner(undefined);
    const res = await postJson("/api/weddings", parsed.data);
    if (res.ok) {
      busy.current = false;
      setPending(false);
      // No router.refresh() here: this page redirects anyone who has a wedding to the
      // dashboard, which would cut the ready screen short.
      return goTo("ready");
    }
    busy.current = false;
    setPending(false);

    switch (res.error.code) {
      case "ALREADY_IN_WORKSPACE":
        // Created from another tab or device. Say so before moving on, so the names typed
        // here aren't mistaken for the ones that were saved.
        setBanner("You already have a wedding, so nothing new was created. Opening it now…");
        busy.current = true;
        return void setTimeout(() => router.replace("/dashboard"), 2000);
      case "NOT_AUTHENTICATED":
        return router.replace("/login");
      case "VALIDATION_FAILED": {
        const found = res.error.fields ?? {};
        setErrors(found);
        return setStep(found.brideName || found.groomName ? 1 : 2);
      }
      default:
        return setBanner(res.error.message);
    }
  }

  if (step === "ready") {
    return (
      <ReadyScreen
        bride={bride.trim()}
        groom={groom.trim()}
        dateText={formatDate(date)}
        daysText={daysToGoText(days)}
      />
    );
  }

  const intro = {
    1: {
      title: "Who’s getting married?",
      text: "These names appear on your dashboard, invitations and wedding website.",
    },
    2: {
      title: "When is the wedding?",
      text: "Use the main wedding day. You’ll add haldi, sangeet and the other events next.",
    },
    3: {
      title: "Add a cover photo",
      text: "It appears at the top of your wedding website. You can change it any time.",
    },
  }[step];

  return (
    <div className="grid w-full max-w-[1100px] grid-cols-1 items-start gap-10 lg:grid-cols-12">
      <div className="lg:col-span-7 lg:pr-4">
        <Stepper current={step} />
        <span className="mb-2 inline-block text-[11px] font-semibold tracking-widest text-champagne-deep uppercase">
          Step {step} of 3{step === 3 && " · Optional"}
        </span>
        <h1
          ref={heading}
          tabIndex={-1}
          className="mb-2 font-display text-3xl leading-tight text-ink outline-none sm:text-4xl"
        >
          {intro.title}
        </h1>
        <p className={`${step === 1 ? "mb-8" : "mb-6"} text-sm leading-relaxed text-ink-secondary`}>
          {intro.text}
        </p>

        {step === 1 && (
          <form method="post" onSubmit={continueFromCouple} noValidate>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                id="brideName"
                label="Bride’s name"
                autoComplete="off"
                placeholder="e.g. Radha"
                value={bride}
                onChange={(e) => setBride(e.target.value)}
                error={errors.brideName}
                iconError
              />
              <TextField
                id="groomName"
                label="Groom’s name"
                autoComplete="off"
                placeholder="e.g. Krishna"
                value={groom}
                onChange={(e) => setGroom(e.target.value)}
                error={errors.groomName}
                iconError
              />
            </div>
            <div className="flex items-center justify-end border-t border-lilac pt-4">
              <Button type="submit" className={primaryButton}>
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form method="post" onSubmit={continueFromDate} noValidate>
            <div className="mb-6">
              <label
                htmlFor="weddingDate"
                className={`mb-2 block text-xs font-medium ${errors.weddingDate ? "text-error" : "text-ink"}`}
              >
                Wedding date
              </label>
              <div className="relative mb-2 max-w-sm">
                <input
                  id="weddingDate"
                  readOnly
                  value={date ? formatDate(date) : ""}
                  placeholder="Choose a date below"
                  aria-invalid={!!errors.weddingDate || undefined}
                  aria-describedby="weddingDate-message"
                  className={`h-12 w-full rounded-input border bg-surface pr-4 pl-11 text-sm font-medium text-ink ring-1 focus:outline-none ${
                    errors.weddingDate ? "border-error ring-error" : "border-plum ring-plum"
                  }`}
                />
                <CalendarOutlineIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-champagne" />
              </div>
              <p
                id="weddingDate-message"
                className={`flex items-center gap-1.5 text-xs font-medium ${errors.weddingDate ? "text-error" : "text-champagne-deep"}`}
              >
                {errors.weddingDate ??
                  (date && date < today ? (
                    <>
                      <span className="size-1.5 rounded-full bg-warning" />
                      That date has already passed. Is it right?
                    </>
                  ) : date ? (
                    <>
                      <span className="size-1.5 rounded-full bg-champagne" />
                      {daysToGoText(days)}
                    </>
                  ) : null)}
              </p>
              <DatePicker
                value={date}
                today={today}
                onChange={(d) => {
                  setDate(d);
                  setErrors({});
                }}
              />
            </div>
            <div className="flex items-center justify-between border-t border-lilac pt-6">
              <Button variant="outline" className={secondaryButton} onClick={() => goTo(1)}>
                Back
              </Button>
              <Button type="submit" className={primaryButton}>
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form method="post" onSubmit={create} noValidate>
            {banner && <FormBanner className="mb-4">{banner}</FormBanner>}
            {/* Cover photos are uploaded through the files module, which comes later. */}
            <div
              aria-disabled="true"
              className="mb-4 w-full cursor-not-allowed rounded-xl border-2 border-dashed border-mauve bg-lilac p-8 text-center"
            >
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface text-plum shadow-sm">
                <ImageOutlineIcon className="size-6" />
              </div>
              <p className="mb-1 text-sm text-ink">
                Drag a photo here or <span className="font-semibold text-plum">choose a file</span>
              </p>
              <p className="text-xs text-ink-secondary">JPEG, PNG or WebP, up to 5 MB.</p>
              <p className="mt-2 text-xs font-medium text-champagne-deep">
                Photo upload is coming soon. You can add one later in Website settings.
              </p>
            </div>
            <div className="mb-8 flex items-start gap-2 rounded-lg border border-border bg-ivory p-3">
              <InfoOutlineIcon className="mt-0.5 size-4 shrink-0 text-champagne" />
              <p className="text-xs leading-relaxed text-ink-secondary">
                Your website address will be{" "}
                <span className="font-mono font-medium text-ink">{address}</span>. You can change it
                later in Website settings.
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-lilac pt-4">
              <Button
                variant="outline"
                className={secondaryButton}
                onClick={() => goTo(2)}
                disabled={pending}
              >
                Back
              </Button>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => create()}
                  disabled={pending}
                  className={`${actionLink} disabled:opacity-50`}
                >
                  Skip for now
                </button>
                <Button type="submit" className={primaryButton} disabled={pending}>
                  {pending ? "Creating…" : "Create wedding"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>

      <div className="lg:col-span-5">{preview(step === 3 ? "awaiting" : "none")}</div>
    </div>
  );
}
