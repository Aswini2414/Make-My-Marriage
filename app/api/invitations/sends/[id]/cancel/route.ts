import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { cancelSend } from "@/modules/invitations/service";

export const POST = handler(
  async (req, ctx: RouteContext<"/api/invitations/sends/[id]/cancel">) => {
    const { membership } = await requireMember(req);
    const { id } = await ctx.params;
    return json(await cancelSend(membership.weddingId, id));
  },
);
