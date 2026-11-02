"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { CheckCircleIcon, PlusBoldIcon } from "@/components/icons";
import { deleteJson, patchJson, postJson } from "@/lib/api-client";
import type { Role } from "@/modules/members/schema";
import { InviteForm } from "./InviteForm";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  isCreator: boolean;
};

export type InviteRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  expiresAt: string;
};

type Props = {
  weddingName: string;
  members: MemberRow[];
  /** Only Admins are given pending invites. */
  invites?: InviteRow[];
  me: { userId: string; role: Role };
};

type Notice = { kind: "error" | "success"; text: string };
type Confirm = { kind: "remove" | "cancel" | "leave"; id: string };

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager" };

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
        muted ? "border border-border bg-lilac text-plum" : "bg-plum text-surface"
      }`}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone: "gold" | "soft" | "plain" }) {
  const tones = {
    gold: "border border-champagne text-champagne-deep",
    soft: "bg-lilac text-plum",
    plain: "border border-border text-ink-secondary",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function expiryText(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Expires today";
  return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

/** The inline "are you sure" strip under a row. */
function ConfirmStrip({
  text,
  action,
  keep,
  busy,
  onConfirm,
  onKeep,
}: {
  text: string;
  action: string;
  keep: string;
  busy: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-input border border-error-border bg-error-bg px-4 py-3 text-xs text-error"
    >
      <span>{text}</span>
      <span className="flex items-center gap-4">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          {action}
        </button>
        <button type="button" onClick={onKeep} disabled={busy} className="font-medium">
          {keep}
        </button>
      </span>
    </div>
  );
}

export function MembersView({ weddingName, members, invites, me }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [confirm, setConfirm] = useState<Confirm>();
  const [working, setWorking] = useState<string>();

  const isAdmin = me.role === "admin";
  const admins = members.filter((m) => m.role === "admin").length;
  const busy = !!working || refreshing;

  /** Runs one call, then shows its result and reloads the lists. */
  async function act(
    key: string,
    call: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>,
    success: string,
    after?: () => void,
  ) {
    if (working) return;
    setWorking(key);
    setNotice(undefined);
    const res = await call();
    setWorking(undefined);
    setConfirm(undefined);
    if (!res.ok) return setNotice({ kind: "error", text: res.error.message });
    setNotice({ kind: "success", text: success });
    if (after) return after();
    startRefresh(() => router.refresh());
  }

  const setRole = (m: MemberRow, role: Role) =>
    act(
      `role:${m.id}`,
      () => patchJson(`/api/members/${m.id}`, { role }),
      `${m.name} is now ${role === "admin" ? "an Admin" : "a Manager"}.`,
    );
  const remove = (m: MemberRow) =>
    act(`remove:${m.id}`, () => deleteJson(`/api/members/${m.id}`), `${m.name} was removed.`);
  const resend = (i: InviteRow) =>
    act(
      `resend:${i.id}`,
      () => postJson(`/api/members/invites/${i.id}/resend`),
      `A new invite was sent to ${i.email}.`,
    );
  const cancel = (i: InviteRow) =>
    act(
      `cancel:${i.id}`,
      () => deleteJson(`/api/members/invites/${i.id}`),
      `The invite to ${i.email} was cancelled.`,
    );
  const leave = () =>
    act(
      "leave",
      () => postJson("/api/members/leave"),
      "You left the wedding.",
      // Without a wedding, the next page is the one that creates one.
      () => router.replace("/onboarding"),
    );

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-ivory px-5 py-5 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs text-ink-secondary">{weddingName}</p>
          <h1 className="mt-0.5 font-display text-2xl leading-tight text-ink lg:text-[28px]">
            Members
          </h1>
        </div>
        {isAdmin && !inviting && (
          <Button onClick={() => setInviting(true)} className="h-auto gap-2 px-4 py-2 text-xs">
            <PlusBoldIcon strokeWidth={2} className="size-3.5" />
            Invite member
          </Button>
        )}
      </header>

      <div className="max-w-4xl flex-1 space-y-6 p-5 sm:p-8">
        {notice &&
          (notice.kind === "error" ? (
            <FormBanner>{notice.text}</FormBanner>
          ) : (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-input border border-success-border bg-success-bg p-3.5 text-[13px] leading-snug text-success"
            >
              <CheckCircleIcon className="mt-px shrink-0 text-lg" />
              <div>{notice.text}</div>
            </div>
          ))}

        {isAdmin && inviting && (
          <InviteForm
            onCancel={() => setInviting(false)}
            onSent={(email) => {
              setInviting(false);
              setNotice({ kind: "success", text: `Invite sent to ${email}.` });
              startRefresh(() => router.refresh());
            }}
          />
        )}

        <section className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6">
          <h2 className="font-display text-xl text-ink">
            Members <span className="text-ink-secondary">({members.length})</span>
          </h2>
          <ul className="mt-2 divide-y divide-border/70">
            {members.map((m) => {
              const mine = m.userId === me.userId;
              const row = `${m.id}`;
              return (
                <li key={row} className="py-4">
                  {confirm?.kind === "remove" && confirm.id === m.id && (
                    <ConfirmStrip
                      text={`Remove ${m.name}? They lose access to this wedding right away.`}
                      action="Remove"
                      keep="Keep"
                      busy={busy}
                      onConfirm={() => remove(m)}
                      onKeep={() => setConfirm(undefined)}
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <Avatar name={m.name} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                        <span className="truncate">{m.name}</span>
                        {mine && <Pill tone="soft">You</Pill>}
                        {m.isCreator && <Pill tone="plain">Creator</Pill>}
                      </p>
                      <p className="truncate text-xs text-ink-secondary">{m.email}</p>
                    </div>
                    {isAdmin ? (
                      <select
                        aria-label={`Role for ${m.name}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => setRole(m, e.target.value as Role)}
                        className="h-9 rounded-full border border-border bg-surface px-3 text-xs font-medium text-ink focus:border-plum focus:outline-none disabled:opacity-60"
                      >
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <Pill tone={m.role === "admin" ? "gold" : "soft"}>{ROLE_LABEL[m.role]}</Pill>
                    )}
                    {isAdmin && !mine && !m.isCreator && (
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: "remove", id: m.id })}
                        disabled={busy}
                        className="tap-area text-xs font-medium text-ink-secondary hover:text-error disabled:opacity-60"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {isAdmin && invites && invites.length > 0 && (
          <section className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6">
            <h2 className="font-display text-xl text-ink">
              Waiting to join <span className="text-ink-secondary">({invites.length})</span>
            </h2>
            <ul className="mt-2 divide-y divide-border/70">
              {invites.map((i) => (
                <li key={i.id} className="py-4">
                  {confirm?.kind === "cancel" && confirm.id === i.id && (
                    <ConfirmStrip
                      text={`Cancel the invite to ${i.email}? Their link stops working.`}
                      action="Cancel invite"
                      keep="Keep"
                      busy={busy}
                      onConfirm={() => cancel(i)}
                      onKeep={() => setConfirm(undefined)}
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <Avatar name={i.name} muted />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                        <span className="truncate">{i.name}</span>
                        <Pill tone="plain">Invited</Pill>
                      </p>
                      <p className="truncate text-xs text-ink-secondary">{i.email}</p>
                      <p suppressHydrationWarning className="mt-0.5 text-[11px] text-ink-secondary">
                        {ROLE_LABEL[i.role]} · {expiryText(i.expiresAt)}
                      </p>
                    </div>
                    <span className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => resend(i)}
                        disabled={busy}
                        className="tap-area text-xs font-medium text-plum hover:underline disabled:opacity-60"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: "cancel", id: i.id })}
                        disabled={busy}
                        className="tap-area text-xs font-medium text-ink-secondary hover:text-error disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6">
          <h2 className="font-display text-xl text-ink">Leave this wedding</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
            You’ll lose access to {weddingName}. Your account stays, and you can create or join
            another wedding.
            {isAdmin && admins <= 1 && (
              <>
                {" "}
                <strong className="font-medium text-ink">
                  You’re the only Admin, so make someone else an Admin first.
                </strong>
              </>
            )}
          </p>
          {confirm?.kind === "leave" ? (
            <div className="mt-4">
              <ConfirmStrip
                text="Leave this wedding now?"
                action="Leave"
                keep="Stay"
                busy={busy}
                onConfirm={leave}
                onKeep={() => setConfirm(undefined)}
              />
            </div>
          ) : (
            <Button
              variant="outline"
              className="mt-4"
              disabled={busy}
              onClick={() => setConfirm({ kind: "leave", id: "me" })}
            >
              Leave wedding
            </Button>
          )}
        </section>
      </div>
    </>
  );
}
