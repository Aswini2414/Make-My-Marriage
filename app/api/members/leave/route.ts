import { requireMember } from "@/lib/access";
import { handler, noContent } from "@/lib/api";
import { leaveWedding } from "@/modules/members/service";

export const POST = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  await leaveWedding({ weddingId: membership.weddingId, userId: user.id });
  return noContent();
});
