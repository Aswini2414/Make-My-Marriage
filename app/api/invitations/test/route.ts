import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { testSchema } from "@/modules/invitations/schema";
import { sendTestEmail } from "@/modules/invitations/service";

export const POST = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  const { guestId, kind } = await parseBody(req, testSchema);
  return json(await sendTestEmail(membership.weddingId, user.email, guestId, kind));
});
