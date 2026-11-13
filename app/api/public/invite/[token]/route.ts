import { clientIp, handler, json } from "@/lib/api";
import { getInvitation } from "@/modules/rsvp/service";

// Public: no login. The token in the path is the only credential. Never log it.
export const GET = handler(async (req, ctx: RouteContext<"/api/public/invite/[token]">) => {
  const { token } = await ctx.params;
  const res = json(await getInvitation(token, clientIp(req)));
  // Personal and changing: never cached, never indexed.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
});
