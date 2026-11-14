import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InvitationView } from "@/components/invitation/InvitationView";
import { clientIpFromHeaders } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { showsNotValidPage } from "@/modules/rsvp/page-state";
import { getInvitation } from "@/modules/rsvp/service";

// The guest's invitation and RSVP page. No login: the link is the credential, so this page is
// never indexed or cached (next.config.ts also sends no-referrer, no-store and noindex headers),
// never writes the link anywhere, and never prints it.
export const metadata: Metadata = {
  title: "Your invitation",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const ip = clientIpFromHeaders(await headers());

  let data;
  try {
    // "Opened" is recorded by the browser after the page loads (see InvitationView), not here.
    data = await getInvitation(token, ip, { markOpened: false });
  } catch (err) {
    // An unknown, malformed or replaced link, and an address that has made too many bad lookups,
    // all get the same "not valid" page with HTTP 404.
    if (err instanceof ApiError && showsNotValidPage(err.code)) notFound();
    throw err;
  }

  return <InvitationView data={data} />;
}
