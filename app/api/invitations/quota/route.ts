import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { getQuota } from "@/modules/invitations/service";

export const GET = handler(async (req) => {
  await requireMember(req);
  return json(await getQuota());
});
