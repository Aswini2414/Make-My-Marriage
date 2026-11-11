import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { bulkDeleteSchema } from "@/modules/guests/schema";
import { deleteGuests } from "@/modules/guests/service";

export const POST = handler(async (req) => {
  const { membership } = await requireMember(req);
  const { guestIds } = await parseBody(req, bulkDeleteSchema);
  return json(await deleteGuests(membership.weddingId, guestIds));
});
