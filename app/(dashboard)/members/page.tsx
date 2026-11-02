import type { Metadata } from "next";
import { MembersView } from "@/components/members/MembersView";
import { pageMember } from "@/lib/page-access";
import { listMembers } from "@/modules/members/service";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const { user, member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding, role } = member!;
  const { items, pendingInvites } = await listMembers(wedding.id, role === "admin");
  return (
    <MembersView
      weddingName={`${wedding.brideName} & ${wedding.groomName}`}
      members={items}
      invites={pendingInvites}
      me={{ userId: user.id, role }}
    />
  );
}
