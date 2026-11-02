"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ButtonLink } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextField } from "@/components/form/TextField";
import { ArrowBackIcon, MailIcon } from "@/components/icons";
import { fieldErrors, postJson, waitText } from "@/lib/api-client";
import { forgotPasswordSchema } from "@/modules/auth/schema";

function BackToLogin({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/login"
      className={`tap-area inline-flex items-center gap-1.5 text-xs font-medium text-plum hover:underline ${className}`}
    >
      <ArrowBackIcon className="text-sm" />
      Back to log in
    </Link>
  );
}

export function ForgotPasswordForm() {
  const [view, setView] = useState<"form" | "sent">("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [banner, setBanner] = useState<string>();
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);
  const [locked, setLocked] = useState(false);

  /** Asks for the link. Used by the form and by "send it again". */
  async function request(address: string) {
    if (busy.current) return;
    setBanner(undefined);
    const parsed = forgotPasswordSchema.safeParse({ email: address });
    if (!parsed.success) {
      setView("form");
      return setError(fieldErrors(parsed.error).email);
    }
    setError(undefined);

    busy.current = true;
    setPending(true);
    const res = await postJson("/api/auth/forgot-password", parsed.data);
    busy.current = false;
    setPending(false);
    if (res.ok) {
      setEmail(parsed.data.email);
      return setView("sent");
    }
    setView("form");
    if (res.error.code === "RATE_LIMITED") {
      setLocked(true);
      setBanner(`Too many reset requests. Try again in ${waitText(res.error.retryAfter)}.`);
    } else {
      setBanner(res.error.message);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    void request(String(new FormData(event.currentTarget).get("email") ?? ""));
  }

  if (view === "sent") {
    return (
      <>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-champagne bg-champagne/10 text-2xl text-champagne">
          <MailIcon />
        </div>
        <h1 className="mb-3 font-display text-3xl leading-tight font-normal text-ink md:text-[34px]">
          Check your email
        </h1>
        <p className="mb-4 text-sm leading-relaxed text-ink">
          If an account exists for <span className="font-medium text-plum">{email}</span>,
          we&apos;ve sent a link to reset your password. The link works for 1 hour.
        </p>
        <p className="mb-8 text-xs leading-relaxed text-ink-secondary">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => void request(email)}
            disabled={pending}
            className="tap-area font-medium text-plum underline hover:no-underline disabled:opacity-50"
          >
            send it again
          </button>
          .
        </p>
        <ButtonLink href="/login" variant="outline" size="lg" className="w-full">
          Back to log in
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <BackToLogin className="mb-8 self-start" />
      <AuthHeading
        variant="reset"
        eyebrow="Reset password"
        title="Forgot your password?"
        subtitle="Enter the email you signed up with and we'll send you a link to set a new one."
        className={banner ? "mb-6" : "mb-8"}
      />
      {banner && <FormBanner className="mb-6">{banner}</FormBanner>}
      <form method="post" onSubmit={onSubmit} noValidate className="space-y-6">
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          defaultValue={email}
          error={error}
          disabled={locked}
        />
        <SubmitButton disabled={pending || locked}>Send reset link</SubmitButton>
      </form>
    </>
  );
}
