import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { bulkEventsSchema } from "@/modules/guests/schema";
import { assignEvents } from "@/modules/guests/service";

export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const input = await parseBody(req, bulkEventsSchema);
  return json(await assignEvents(membership.weddingId, input));
});
