import { requireMember } from "@/lib/access";
import { handler, json, parseQuery } from "@/lib/api";
import { previewQuery } from "@/modules/invitations/schema";
import { previewEmail } from "@/modules/invitations/service";

export const GET = handler(async (req) => {
  const { membership } = await requireMember(req);
  const { guestId, kind } = parseQuery(req, previewQuery);
  const res = json(await previewEmail(membership.weddingId, guestId, kind));
  // The preview holds the guest's personal link.
  res.headers.set("Cache-Control", "no-store");
  return res;
});
