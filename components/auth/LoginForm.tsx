"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { FormBanner } from "@/components/form/FormBanner";
import { PasswordField } from "@/components/form/PasswordField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextField } from "@/components/form/TextField";
import { fieldErrors, postJson, safeNext, waitText } from "@/lib/api-client";
import { loginSchema } from "@/modules/auth/schema";

type AuthResponse = { wedding: unknown | null };

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);
  const [locked, setLocked] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || locked) return;
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    setBanner(undefined);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});

    busy.current = true;
    setPending(true);
    const res = await postJson<AuthResponse>("/api/auth/login", parsed.data);
    if (res.ok) {
      // Someone without a wedding yet goes on to create one.
      router.replace(res.data.wedding ? (safeNext(next) ?? "/dashboard") : "/onboarding");
      return;
    }
    busy.current = false;
    setPending(false);
    if (res.error.code === "RATE_LIMITED") {
      setLocked(true);
      setBanner(`Too many attempts. Try again in ${waitText(res.error.retryAfter)}.`);
    } else {
      setErrors(res.error.fields ?? {});
      setBanner(res.error.code === "VALIDATION_FAILED" ? undefined : res.error.message);
    }
  }

  return (
    <>
      {banner && <FormBanner className="mt-6">{banner}</FormBanner>}
      <form method="post" onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          error={errors.email}
          disabled={locked}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          error={errors.password}
          disabled={locked}
          labelAside={
            <Link
              href="/forgot-password"
              className="tap-area rounded text-xs font-medium text-plum hover:underline"
            >
              Forgot password?
            </Link>
          }
        />
        <div className="pt-1">
          <SubmitButton disabled={pending || locked}>Log in</SubmitButton>
        </div>
      </form>
    </>
  );
}
