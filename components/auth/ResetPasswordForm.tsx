"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ButtonLink } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { PasswordField } from "@/components/form/PasswordField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { ArrowBackIcon, ScheduleIcon } from "@/components/icons";
import { fieldErrors, postJson } from "@/lib/api-client";
import { resetPasswordSchema } from "@/modules/auth/schema";

type AuthResponse = { wedding: unknown | null };

/** The page you reach from the emailed link. A missing, used or expired link shows the expired view. */
export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [expired, setExpired] = useState(!token);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const parsed = resetPasswordSchema.safeParse({ token, password });
    const found = parsed.success ? {} : fieldErrors(parsed.error);
    if (!found.password && password !== confirm) found.confirm = "The passwords don't match.";
    setBanner(undefined);
    setErrors(found);
    if (!parsed.success || found.confirm) return;

    busy.current = true;
    setPending(true);
    const res = await postJson<AuthResponse>("/api/auth/reset-password", parsed.data);
    if (res.ok) {
      router.replace(res.data.wedding ? "/dashboard" : "/onboarding");
      return;
    }
    busy.current = false;
    setPending(false);
    if (res.error.code === "TOKEN_INVALID") return setExpired(true);
    setBanner(res.error.message);
  }

  if (expired) {
    return (
      <>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-error-border bg-error-bg text-2xl text-error">
          <ScheduleIcon />
        </div>
        <h1 className="mb-3 font-display text-3xl leading-tight font-normal text-ink md:text-[34px]">
          This link has expired
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-secondary">
          Reset links work for 1 hour and only once. Request a new one to continue.
        </p>
        <ButtonLink href="/forgot-password" size="lg" className="mb-6 w-full">
          Send a new link
        </ButtonLink>
        <Link
          href="/login"
          className="tap-area inline-flex items-center justify-center gap-1.5 text-xs font-medium text-plum hover:underline"
        >
          <ArrowBackIcon className="text-sm" />
          Back to log in
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        variant="reset"
        eyebrow="Reset password"
        title="Set a new password"
        subtitle="Choose a password you haven't used here before."
        className={banner ? "mb-6" : "mb-8"}
      />
      {banner && <FormBanner className="mb-6">{banner}</FormBanner>}
      <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          hint="At least 8 characters."
          error={errors.password}
        />
        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          error={errors.confirm}
        />
        <div className="pt-2">
          <SubmitButton disabled={pending}>Save and log in</SubmitButton>
        </div>
      </form>
    </>
  );
}
