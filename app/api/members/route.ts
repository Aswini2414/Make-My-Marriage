import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { listMembers } from "@/modules/members/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  // Pending invites are for Admins only.
  return json(await listMembers(membership.weddingId, membership.role === "admin"));
});
