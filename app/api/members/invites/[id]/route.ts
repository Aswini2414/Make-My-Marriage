import { requireMember } from "@/lib/access";
import { handler, noContent } from "@/lib/api";
import { cancelInvite } from "@/modules/members/service";

export const DELETE = handler(async (req, ctx: RouteContext<"/api/members/invites/[id]">) => {
  const { user, membership } = await requireMember(req, "admin");
  const { id } = await ctx.params;
  await cancelInvite({ weddingId: membership.weddingId, userId: user.id }, id);
  return noContent();
});
