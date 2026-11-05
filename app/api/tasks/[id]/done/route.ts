import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { markDone } from "@/modules/tasks/service";

// The assignee or any Admin. Any other Manager gets 403 NOT_ASSIGNEE.
export const POST = handler(async (req, ctx: RouteContext<"/api/tasks/[id]/done">) => {
  const { user, membership } = await requireMember(req);
  const { id } = await ctx.params;
  const task = await markDone(membership.weddingId, { userId: user.id, role: membership.role }, id);
  return json({ task });
});
