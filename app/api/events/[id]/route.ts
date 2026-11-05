import { requireMember } from "@/lib/access";
import { handler, json, noContent, parseBody } from "@/lib/api";
import { updateEventSchema } from "@/modules/events/schema";
import { deleteEvent, getEvent, updateEvent } from "@/modules/events/service";

export const GET = handler(async (req, ctx: RouteContext<"/api/events/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await getEvent(membership.weddingId, id));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/events/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  const input = await parseBody(req, updateEventSchema);
  return json({ event: await updateEvent(membership.weddingId, id, input) });
});

export const DELETE = handler(async (req, ctx: RouteContext<"/api/events/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  await deleteEvent(membership.weddingId, id);
  return noContent();
});
