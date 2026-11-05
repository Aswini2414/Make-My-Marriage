import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { addEventTypeSchema } from "@/modules/events/schema";
import { addEventType, getEventTypes } from "@/modules/events/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json(await getEventTypes(membership.weddingId));
});

export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const { name } = await parseBody(req, addEventTypeSchema);
  return json({ custom: await addEventType(membership.weddingId, name) }, 201);
});
