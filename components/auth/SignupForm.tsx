"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FormBanner } from "@/components/form/FormBanner";
import { PasswordField } from "@/components/form/PasswordField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextField } from "@/components/form/TextField";
import { MailIcon } from "@/components/icons";
import { fieldErrors, postJson, waitText } from "@/lib/api-client";
import { signupSchema } from "@/modules/auth/schema";

type Banner = { kind: "email-taken" } | { kind: "message"; text: string };

export function SignupForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>();
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);
  const [locked, setLocked] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || locked) return;
    const form = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    setBanner(undefined);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});

    busy.current = true;
    setPending(true);
    const res = await postJson("/api/auth/signup", parsed.data);
    // A new account has no wedding yet, so the next step is to create one.
    if (res.ok) return router.replace("/onboarding");
    busy.current = false;
    setPending(false);

    switch (res.error.code) {
      case "EMAIL_TAKEN":
        return setBanner({ kind: "email-taken" });
      case "RATE_LIMITED":
        setLocked(true);
        return setBanner({
          kind: "message",
          text: `Too many sign-ups from this device. Try again in ${waitText(res.error.retryAfter)}.`,
        });
      case "VALIDATION_FAILED":
        return setErrors(res.error.fields ?? {});
      default:
        return setBanner({ kind: "message", text: res.error.message });
    }
  }

  return (
    <>
      <AuthHeading
        variant="signup"
        eyebrow="Get started"
        title="Create your account"
        subtitle="You'll set up your wedding on the next step."
        className={banner ? "mb-5" : "mb-7"}
      />
      {banner && (
        <FormBanner className="mb-5">
          {banner.kind === "email-taken" ? (
            <>
              An account with this email already exists.
              <Link
                href="/login"
                className="tap-area ml-1 font-medium whitespace-nowrap text-plum underline underline-offset-2 hover:opacity-80"
              >
                Log in instead
              </Link>
            </>
          ) : (
            banner.text
          )}
        </FormBanner>
      )}
      <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          id="name"
          label="Your name"
          autoComplete="name"
          placeholder="Radha"
          error={errors.name}
          disabled={locked}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          error={errors.email}
          invalid={banner?.kind === "email-taken"}
          disabled={locked}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          placeholder="••••••••"
          hint="At least 8 characters."
          error={errors.password}
          disabled={locked}
        />
        <div className="pt-2">
          <SubmitButton disabled={pending || locked}>Create account</SubmitButton>
        </div>
      </form>
      <p className="mt-4 text-center text-[13px] text-ink-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="tap-area font-medium text-plum underline underline-offset-2 hover:opacity-80"
        >
          Log in
        </Link>
      </p>
      <hr className="my-5 border-t border-border" />
      <div className="flex items-start gap-2.5 rounded-card bg-lilac p-3.5">
        <MailIcon className="mt-0.5 shrink-0 text-base text-plum" />
        <p className="text-xs leading-relaxed text-ink">
          <strong className="font-medium">Invited by family?</strong> Use the link in your
          invitation email to join their wedding instead.
        </p>
      </div>
    </>
  );
}
