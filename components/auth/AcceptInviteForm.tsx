"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ButtonLink } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { LockedField } from "@/components/form/LockedField";
import { PasswordField } from "@/components/form/PasswordField";
import { SubmitButton } from "@/components/form/SubmitButton";
import { TextField } from "@/components/form/TextField";
import { InfoOutlineIcon, ScheduleIcon } from "@/components/icons";
import { LogoutButton } from "@/components/LogoutButton";
import { fieldErrors, postJson, waitText } from "@/lib/api-client";
import { acceptSchema, newPassword } from "@/modules/members/schema";

export type InviteView = {
  weddingName: string;
  invitedName: string;
  email: string;
  role: "admin" | "manager";
  hasAccount: boolean;
};

type Props = {
  token: string;
  /** The invite, or none when the link is unknown or already used. */
  invite?: InviteView;
  expired: boolean;
  /** Someone is logged in on this device. */
  signedIn: boolean;
  /** Who that is, so the page can warn when the invite is for someone else. */
  signedInEmail?: string;
};

type View = "form" | "expired" | "other-wedding";

const roleText = (role: InviteView["role"]) => (role === "admin" ? "an Admin" : "a Manager");

/** Everything on the right of the accept-invite page. */
export function AcceptInviteForm({ token, invite, expired, signedIn, signedInEmail }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>(invite && !expired ? "form" : "expired");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [wrongPassword, setWrongPassword] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || locked || !invite) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const name = invite.hasAccount ? undefined : String(form.get("name") ?? "").trim();

    const parsed = acceptSchema.safeParse({ token, password, ...(name ? { name } : {}) });
    const found = parsed.success ? {} : fieldErrors(parsed.error);
    // Only a new account is held to the password rules; an existing one just has to match.
    if (!invite.hasAccount && !found.password) {
      const rule = newPassword.safeParse(password);
      if (!rule.success) found.password = rule.error.issues[0]!.message;
    }
    if (invite.hasAccount && !password) found.password = "Enter your password.";
    setBanner(undefined);
    setWrongPassword(false);
    setErrors(found);
    if (!parsed.success || Object.keys(found).length > 0) return;

    busy.current = true;
    setPending(true);
    const res = await postJson("/api/members/accept", parsed.data);
    // The session cookie is set, and the account now has a wedding.
    if (res.ok) return router.replace("/dashboard");
    busy.current = false;
    setPending(false);

    switch (res.error.code) {
      case "INVALID_CREDENTIALS":
        return (setWrongPassword(true), setBanner("That password isn’t right. Try again."));
      case "RATE_LIMITED":
        setLocked(true);
        return setBanner(`Too many attempts. Try again in ${waitText(res.error.retryAfter)}.`);
      case "TOKEN_INVALID":
        return setView("expired");
      case "IN_OTHER_WORKSPACE":
        return setView("other-wedding");
      case "VALIDATION_FAILED":
        return setErrors(res.error.fields ?? {});
      default:
        return setBanner(res.error.message);
    }
  }

  if (view === "expired") {
    return (
      <>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-error-border bg-error-bg text-2xl text-error">
          <ScheduleIcon />
        </div>
        <h1 className="mb-3 font-display text-3xl leading-tight font-normal text-ink">
          {invite ? "This invite has expired" : "This invite link isn’t valid"}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-secondary">
          {invite
            ? `Invites work for 7 days and only once. Ask an Admin of ${invite.weddingName}’s wedding to send you a new one.`
            : "It may have been used already, or replaced by a newer one. Ask an Admin of the wedding to send you a new invite."}
        </p>
        <ButtonLink href="/login" variant="outline" size="lg" className="w-full">
          Go to log in
        </ButtonLink>
      </>
    );
  }

  if (view === "other-wedding" && invite) {
    return (
      <>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-border bg-lilac text-2xl text-plum">
          <InfoOutlineIcon />
        </div>
        <h1 className="mb-3 font-display text-3xl leading-tight font-normal text-ink">
          You’re already in another wedding
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-secondary">
          Each account can belong to one wedding at a time. To join {invite.weddingName}’s, first
          leave your current wedding from its Members page.
        </p>
        <ButtonLink
          href={signedIn ? "/dashboard" : "/login"}
          size="lg"
          className="w-full shadow-sm"
        >
          {signedIn ? "Go to my wedding" : "Log in to my wedding"}
        </ButtonLink>
        {signedIn && (
          <LogoutButton className="mt-4 block w-full text-center text-sm font-medium text-plum hover:underline" />
        )}
      </>
    );
  }

  if (!invite) return null;
  const firstName = invite.invitedName.trim().split(/\s+/)[0];
  const heading = invite.hasAccount
    ? {
        title: `Welcome back, ${firstName}`,
        subtitle: "You already have an account. Log in to accept this invite.",
      }
    : {
        title: "Set up your account",
        subtitle: `You’re joining ${invite.weddingName}’s wedding as ${roleText(invite.role)}.`,
      };

  return (
    <>
      <AuthHeading
        variant="invite"
        eyebrow="Join the wedding"
        title={heading.title}
        subtitle={heading.subtitle}
        className={banner ? "mb-5" : "mb-7"}
      />
      {signedInEmail && signedInEmail !== invite.email && (
        <div
          role="note"
          className="mb-5 rounded-input border border-warning-border bg-warning-bg p-3.5 text-[13px] leading-snug text-warning"
        >
          You’re logged in as <strong className="font-semibold">{signedInEmail}</strong>. This
          invite is for <strong className="font-semibold">{invite.email}</strong>, and accepting it
          will log you out of the other account.{" "}
          <LogoutButton
            redirectTo={`/accept-invite?token=${encodeURIComponent(token)}`}
            className="font-semibold underline underline-offset-2"
          />
        </div>
      )}
      {banner && <FormBanner className="mb-5">{banner}</FormBanner>}
      <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
        {!invite.hasAccount && (
          <TextField
            id="name"
            label="Your name"
            autoComplete="name"
            defaultValue={invite.invitedName}
            error={errors.name}
            disabled={locked}
            large
          />
        )}
        <LockedField id="email" label="Email" value={invite.email} large />
        <PasswordField
          id="password"
          label={invite.hasAccount ? "Password" : "Create a password"}
          autoComplete={invite.hasAccount ? "current-password" : "new-password"}
          placeholder={invite.hasAccount ? "Enter your password" : undefined}
          hint={invite.hasAccount ? undefined : "At least 8 characters."}
          error={errors.password}
          invalid={wrongPassword}
          disabled={locked}
          large
          labelAside={
            invite.hasAccount && (
              <Link
                href="/forgot-password"
                className="tap-area text-xs font-medium text-plum hover:underline"
              >
                Forgot password?
              </Link>
            )
          }
        />
        <div className="pt-2">
          <SubmitButton disabled={pending || locked}>
            {invite.hasAccount ? "Log in and join" : "Join the wedding"}
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
