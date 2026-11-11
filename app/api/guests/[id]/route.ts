import { requireMember } from "@/lib/access";
import { handler, json, noContent, parseBody } from "@/lib/api";
import { updateGuestSchema } from "@/modules/guests/schema";
import { deleteGuest, getGuest, updateGuest } from "@/modules/guests/service";

export const GET = handler(async (req, ctx: RouteContext<"/api/guests/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await getGuest(membership.weddingId, id));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/guests/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  const input = await parseBody(req, updateGuestSchema);
  return json(await updateGuest(membership.weddingId, id, input));
});

export const DELETE = handler(async (req, ctx: RouteContext<"/api/guests/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  await deleteGuest(membership.weddingId, id);
  return noContent();
});
