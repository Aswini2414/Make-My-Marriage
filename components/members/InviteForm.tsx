"use client";

import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { TextField } from "@/components/form/TextField";
import { fieldErrors, postJson, waitText } from "@/lib/api-client";
import { inviteSchema, type Role } from "@/modules/members/schema";

const ROLE_OPTIONS: { value: Role; title: string; text: string }[] = [
  {
    value: "manager",
    title: "Manager",
    text: "Plans everything, including Money. Can’t manage members.",
  },
  { value: "admin", title: "Admin", text: "Everything a Manager can do, plus managing members." },
];

type Props = {
  onSent: (email: string) => void;
  onCancel: () => void;
};

/** The "Invite a member" card: name, email and role, then an email goes out. */
export function InviteForm({ onSent, onCancel }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [role, setRole] = useState<Role>("manager");
  const [pending, setPending] = useState(false);
  // State updates are not instant, so two quick clicks need a flag that changes at once.
  const busy = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    const parsed = inviteSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      role,
    });
    setBanner(undefined);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});

    busy.current = true;
    setPending(true);
    const res = await postJson("/api/members/invites", parsed.data);
    busy.current = false;
    setPending(false);
    if (res.ok) return onSent(parsed.data.email);

    switch (res.error.code) {
      case "VALIDATION_FAILED":
        return setErrors(res.error.fields ?? {});
      case "RATE_LIMITED":
        return setBanner(
          `You’ve sent a lot of invites. Try again in ${waitText(res.error.retryAfter)}.`,
        );
      case "EMAIL_CAP_REACHED":
        return setBanner("We’ve reached today’s email limit. Please try again tomorrow.");
      default:
        return setBanner(res.error.message);
    }
  }

  return (
    <section
      aria-labelledby="invite-heading"
      className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6"
    >
      <h2 id="invite-heading" className="font-display text-xl text-ink">
        Invite a member
      </h2>
      <p className="mt-1 mb-5 text-xs text-ink-secondary">
        We’ll email them a link that works for 7 days.
      </p>
      {banner && <FormBanner className="mb-4">{banner}</FormBanner>}
      <form method="post" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="invite-name"
            label="Name"
            name="name"
            autoComplete="off"
            placeholder="e.g. Anil"
            error={errors.name}
          />
          <TextField
            id="invite-email"
            label="Email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            error={errors.email}
          />
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-ink">Role</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-input border p-3.5 transition-colors ${
                  role === option.value
                    ? "border-plum bg-lilac/60"
                    : "border-border bg-surface hover:border-champagne"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="mt-0.5 accent-plum"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-secondary">
                    {option.text}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errors.role && (
            <p className="mt-1.5 text-[11px] font-medium text-error">{errors.role}</p>
          )}
        </fieldset>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>
    </section>
  );
}
