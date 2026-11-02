import { clientIp, handler, json, parseBody, parseQuery, withSession } from "@/lib/api";
import { acceptQuery, acceptSchema } from "@/modules/members/schema";
import { acceptInvite, inviteInfo } from "@/modules/members/service";

// Public: the invite token is the credential.
export const GET = handler(async (req) => {
  const { token } = parseQuery(req, acceptQuery);
  return json(await inviteInfo(token));
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, acceptSchema);
  const result = await acceptInvite(input, clientIp(req));
  return withSession(json(result), result.user.id);
});
