import type { Metadata } from "next";

// Guest invitation and RSVP page, looked up by token on the server. Built in Phase 4.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function InvitationPage() {
  return <h1 className="font-display text-4xl">Your invitation</h1>;
}
