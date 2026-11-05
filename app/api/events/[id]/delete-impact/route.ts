import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { getDeleteImpact } from "@/modules/events/service";

export const GET = handler(async (req, ctx: RouteContext<"/api/events/[id]/delete-impact">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await getDeleteImpact(membership.weddingId, id));
});
