import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { resendInvite } from "@/modules/members/service";

export const POST = handler(async (req, ctx: RouteContext<"/api/members/invites/[id]/resend">) => {
  const { user, membership } = await requireMember(req, "admin");
  const { id } = await ctx.params;
  const invite = await resendInvite({ weddingId: membership.weddingId, userId: user.id }, id);
  return json({ invite });
});
