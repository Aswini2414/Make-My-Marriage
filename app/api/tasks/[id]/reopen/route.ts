import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { reopenTask } from "@/modules/tasks/service";

// Same rule as marking done: the assignee or any Admin.
export const POST = handler(async (req, ctx: RouteContext<"/api/tasks/[id]/reopen">) => {
  const { user, membership } = await requireMember(req);
  const { id } = await ctx.params;
  const task = await reopenTask(
    membership.weddingId,
    { userId: user.id, role: membership.role },
    id,
  );
  return json({ task });
});
