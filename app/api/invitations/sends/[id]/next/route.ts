import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { nextBatch } from "@/modules/invitations/service";

// Any Admin or Manager of the wedding can carry on a send someone else started.
export const POST = handler(async (req, ctx: RouteContext<"/api/invitations/sends/[id]/next">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await nextBatch(membership.weddingId, id));
});
