"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { FormBanner } from "@/components/form/FormBanner";
import { TextField } from "@/components/form/TextField";
import { CheckCircleIcon } from "@/components/icons";
import { deleteJson, patchJson } from "@/lib/api-client";
import { formatDate, weddingDateBounds } from "@/lib/dates";
import { brideName, groomName, weddingDate } from "@/modules/weddings/schema";

type Props = {
  wedding: {
    brideName: string;
    groomName: string;
    weddingDate: string;
    slug: string;
    /** After this day guests can no longer change their RSVP. */
    rsvpCutoffDate: string | null;
  };
  isAdmin: boolean;
  today: string;
};

const card = "rounded-card border border-border bg-surface p-5 shadow-2xs sm:p-6";

/** Wedding details: fix the names or date, and (Admins) delete the wedding. */
export function WeddingSettings({ wedding, isAdmin, today }: Props) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [bride, setBride] = useState(wedding.brideName);
  const [groom, setGroom] = useState(wedding.groomName);
  const [date, setDate] = useState(wedding.weddingDate);
  const [cutoff, setCutoff] = useState(wedding.rsvpCutoffDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);

  const { min, max } = weddingDateBounds(today);
  const changed =
    bride.trim() !== wedding.brideName ||
    groom.trim() !== wedding.groomName ||
    date !== wedding.weddingDate ||
    cutoff !== (wedding.rsvpCutoffDate ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    setBanner(undefined);
    const found: Record<string, string> = {};
    const b = brideName.safeParse(bride);
    const g = groomName.safeParse(groom);
    const d = weddingDate.safeParse(date);
    if (!b.success) found.brideName = b.error.issues[0]!.message;
    if (!g.success) found.groomName = g.error.issues[0]!.message;
    if (!d.success) found.weddingDate = d.error.issues[0]!.message;
    if (cutoff && d.success && cutoff > date) {
      found.rsvpCutoffDate = "The RSVP cut-off can’t be after the wedding date.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    const res = await patchJson("/api/wedding", {
      brideName: bride,
      groomName: groom,
      weddingDate: date,
      // An empty field clears the cut-off (guests can always answer).
      rsvpCutoffDate: cutoff || null,
    });
    setSaving(false);
    if (!res.ok) {
      setErrors(res.error.fields ?? {});
      return setBanner(res.error.message);
    }
    setBride(bride.trim());
    setGroom(groom.trim());
    setSaved(true);
    // The sidebar and dashboard read the names on the server.
    startRefresh(() => router.refresh());
  }

  async function remove(event: FormEvent) {
    event.preventDefault();
    if (deletePending) return;
    setDeleteError(undefined);
    setDeletePending(true);
    const res = await deleteJson("/api/wedding", { confirmSlug: confirmText });
    if (!res.ok) {
      setDeletePending(false);
      return setDeleteError(res.error.fields?.confirmSlug ?? res.error.message);
    }
    // Nothing is left to show: the next page is the one that creates a wedding.
    router.replace("/onboarding");
  }

  return (
    <>
      <header className="border-b border-border/60 bg-ivory px-5 py-5 sm:px-8">
        <p className="text-xs text-ink-secondary">Settings</p>
        <h1 className="mt-0.5 font-display text-2xl leading-tight text-ink lg:text-[28px]">
          Wedding details
        </h1>
      </header>

      <div className="max-w-3xl flex-1 space-y-6 p-5 sm:p-8">
        <form onSubmit={save} noValidate className={card}>
          <h2 className="font-display text-xl text-ink">Names and date</h2>
          <p className="mt-1 mb-5 text-xs leading-relaxed text-ink-secondary">
            Shown on your dashboard, invitations and wedding website.
          </p>
          {banner && <FormBanner className="mb-4">{banner}</FormBanner>}
          {saved && (
            <div
              role="status"
              className="mb-4 flex items-start gap-2.5 rounded-input border border-success-border bg-success-bg p-3.5 text-[13px] leading-snug text-success"
            >
              <CheckCircleIcon className="mt-px shrink-0 text-lg" />
              <div>Your changes were saved.</div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              id="brideName"
              label="Bride’s name"
              autoComplete="off"
              value={bride}
              onChange={(e) => setBride(e.target.value)}
              error={errors.brideName}
            />
            <TextField
              id="groomName"
              label="Groom’s name"
              autoComplete="off"
              value={groom}
              onChange={(e) => setGroom(e.target.value)}
              error={errors.groomName}
            />
          </div>
          <div className="mt-4 max-w-xs">
            <TextField
              id="weddingDate"
              label="Wedding date"
              type="date"
              min={min}
              max={max}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.weddingDate}
              hint={date && !errors.weddingDate ? formatDate(date) : undefined}
            />
          </div>
          <div className="mt-4 max-w-xs">
            <TextField
              id="rsvpCutoffDate"
              label="RSVP cut-off date (optional)"
              type="date"
              max={date || undefined}
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              error={errors.rsvpCutoffDate}
              hint={
                errors.rsvpCutoffDate
                  ? undefined
                  : cutoff
                    ? `Guests can change their reply until ${formatDate(cutoff)}.`
                    : "Leave empty to let guests reply any time."
              }
            />
          </div>
          <div className="mt-6 flex justify-end border-t border-lilac pt-4">
            <Button type="submit" className="h-11 px-8" disabled={!changed || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        {isAdmin && (
          <section className={`${card} border-error-border`}>
            <h2 className="font-display text-xl text-ink">Delete this wedding</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              This removes the wedding, its website and everything in it for every member. It can’t
              be undone. Use it if you set the wedding up by mistake.
            </p>
            {deleting ? (
              <form onSubmit={remove} noValidate className="mt-4 max-w-md">
                {deleteError && <FormBanner className="mb-3">{deleteError}</FormBanner>}
                <TextField
                  id="confirmSlug"
                  label={`Type ${wedding.slug} to confirm`}
                  autoComplete="off"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
                <div className="mt-4 flex items-center gap-4">
                  <Button
                    type="submit"
                    className="border-error bg-error hover:bg-error"
                    disabled={deletePending || confirmText.trim().toLowerCase() !== wedding.slug}
                  >
                    {deletePending ? "Deleting…" : "Delete wedding"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(false);
                      setConfirmText("");
                      setDeleteError(undefined);
                    }}
                    disabled={deletePending}
                    className="tap-area text-sm font-medium text-ink-secondary hover:text-ink"
                  >
                    Keep it
                  </button>
                </div>
              </form>
            ) : (
              <Button variant="outline" className="mt-4" onClick={() => setDeleting(true)}>
                Delete wedding…
              </Button>
            )}
          </section>
        )}
      </div>
    </>
  );
}
