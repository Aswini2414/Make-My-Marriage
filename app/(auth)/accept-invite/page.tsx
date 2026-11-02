import type { Metadata } from "next";
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { InvitePanel } from "@/components/auth/InvitePanel";
import { ResetPanel } from "@/components/auth/panels";
import { maybeUser } from "@/lib/page-access";
import { lookupInvite } from "@/modules/members/service";

export const metadata: Metadata = {
  title: "Join the wedding",
  // The link carries a secret token, so don't send it on to other sites.
  referrer: "no-referrer",
};

export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const { token } = await searchParams;
  const found =
    typeof token === "string" && token
      ? await lookupInvite(token)
      : ({ status: "invalid" } as const);
  const me = await maybeUser();
  const signedIn = !!me;
  const signedInEmail = me?.email;

  if (found.status === "invalid") {
    return (
      <AuthShell panel={<ResetPanel />}>
        <AcceptInviteForm token="" expired signedIn={signedIn} signedInEmail={signedInEmail} />
      </AuthShell>
    );
  }

  const { info } = found;
  return (
    <AuthShell
      panel={
        <InvitePanel
          weddingName={info.weddingName}
          weddingDate={info.weddingDate}
          invitedBy={info.invitedBy}
          role={info.role}
          faded={found.status === "expired"}
        />
      }
    >
      <AcceptInviteForm
        token={token as string}
        invite={info}
        expired={found.status === "expired"}
        signedIn={signedIn}
        signedInEmail={signedInEmail}
      />
    </AuthShell>
  );
}
