import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { getDashboard } from "@/modules/dashboard/service";

export const GET = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  return json(await getDashboard(membership.weddingId, { userId: user.id, role: membership.role }));
});
