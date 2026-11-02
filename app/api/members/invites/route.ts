import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { inviteSchema } from "@/modules/members/schema";
import { inviteMember } from "@/modules/members/service";

export const POST = handler(async (req) => {
  const { user, membership } = await requireMember(req, "admin");
  const input = await parseBody(req, inviteSchema);
  const invite = await inviteMember({ weddingId: membership.weddingId, userId: user.id }, input);
  return json({ invite }, 201);
});
