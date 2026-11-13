import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { retryFailed } from "@/modules/invitations/service";

export const POST = handler(
  async (req, ctx: RouteContext<"/api/invitations/sends/[id]/retry-failed">) => {
    const { membership } = await requireMember(req);
    const { id } = await ctx.params;
    return json(await retryFailed(membership.weddingId, id));
  },
);
