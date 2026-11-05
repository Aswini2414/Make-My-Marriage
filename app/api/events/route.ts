import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { createEventSchema } from "@/modules/events/schema";
import { createEvent, listEvents } from "@/modules/events/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json({ items: await listEvents(membership.weddingId) });
});

export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const input = await parseBody(req, createEventSchema);
  return json({ event: await createEvent(membership.weddingId, input) }, 201);
});
