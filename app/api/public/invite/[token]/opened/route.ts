import { clientIp, handler, noContent } from "@/lib/api";
import { markInvitationOpened } from "@/modules/rsvp/service";

// Public: no login. Called once by the invitation page's browser code after it has loaded, so a
// mail scanner that only fetches the page's HTML does not count as "opened". `handler()` checks
// the Origin header on this POST, like every write.
export const POST = handler(async (req, ctx: RouteContext<"/api/public/invite/[token]/opened">) => {
  const { token } = await ctx.params;
  await markInvitationOpened(token, clientIp(req));
  const res = noContent();
  res.headers.set("Cache-Control", "no-store");
  return res;
});
