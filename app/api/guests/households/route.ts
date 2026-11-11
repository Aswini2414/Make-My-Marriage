import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { listHouseholds } from "@/modules/guests/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json({ items: await listHouseholds(membership.weddingId) });
});
