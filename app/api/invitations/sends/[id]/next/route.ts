import { requireMember } from "@/lib/access";
import { handler, json } from "@/lib/api";
import { nextBatch } from "@/modules/invitations/service";

// A batch is up to 20 emails, spaced out to stay under the email provider's rate limit (2 a second
// by default), so it can take longer than a platform's default function time.
export const maxDuration = 60;

// Any Admin or Manager of the wedding can carry on a send someone else started.
export const POST = handler(async (req, ctx: RouteContext<"/api/invitations/sends/[id]/next">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json(await nextBatch(membership.weddingId, id));
});
