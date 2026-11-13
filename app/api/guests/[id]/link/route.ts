import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { getGuestLink } from "@/modules/invitations/token";

export const GET = handler(async (req, ctx: RouteContext<"/api/guests/[id]/link">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  const res = json(await getGuestLink(membership.weddingId, id));
  res.headers.set("Cache-Control", "no-store");
  return res;
});
