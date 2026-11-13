import { requireMember } from "@/lib/access";
import { handler, json, parseBody } from "@/lib/api";
import { startSendSchema } from "@/modules/invitations/schema";
import { listSends, startSend } from "@/modules/invitations/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  return json(await listSends(membership.weddingId));
});

export const POST = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  const input = await parseBody(req, startSendSchema);
  return json(await startSend(membership.weddingId, user.id, input), 201);
});
