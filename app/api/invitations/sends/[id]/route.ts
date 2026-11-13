import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { getSend } from "@/modules/invitations/service";

export const GET = handler(async (req, ctx: RouteContext<"/api/invitations/sends/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await getSend(membership.weddingId, id));
});
