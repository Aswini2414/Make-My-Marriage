import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { regenerateGuestLink } from "@/modules/invitations/token";

export const POST = handler(async (req, ctx: RouteContext<"/api/guests/[id]/regenerate-link">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  const res = json(await regenerateGuestLink(membership.weddingId, id));
  res.headers.set("Cache-Control", "no-store");
  return res;
});
