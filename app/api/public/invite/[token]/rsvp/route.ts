import { clientIp, handler, json, parseBody } from "@/lib/api";
import { rsvpBodySchema } from "@/modules/rsvp/schema";
import { saveAnswers } from "@/modules/rsvp/service";

// Public: no login. `handler()` checks the Origin header on this POST, like every write.
export const POST = handler(async (req, ctx: RouteContext<"/api/public/invite/[token]/rsvp">) => {
  const { token } = await ctx.params;
  const body = await parseBody(req, rsvpBodySchema);
  const res = json({ saved: await saveAnswers(token, clientIp(req), body) });
  res.headers.set("Cache-Control", "no-store");
  return res;
});
