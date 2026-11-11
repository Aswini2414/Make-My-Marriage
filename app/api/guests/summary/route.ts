import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { guestSummary } from "@/modules/guests/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json(await guestSummary(membership.weddingId));
});
