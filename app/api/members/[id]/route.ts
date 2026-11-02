import { requireMember } from "@/lib/access";
import { handler, json, noContent, parseBody } from "@/lib/api";
import { changeRoleSchema } from "@/modules/members/schema";
import { changeRole, removeMember } from "@/modules/members/service";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/members/[id]">) => {
  const { user, membership } = await requireMember(req, "admin");
  const { id } = await ctx.params;
  const { role } = await parseBody(req, changeRoleSchema);
  const member = await changeRole({ weddingId: membership.weddingId, userId: user.id }, id, role);
  return json({ member });
});

export const DELETE = handler(async (req, ctx: RouteContext<"/api/members/[id]">) => {
  const { user, membership } = await requireMember(req, "admin");
  const { id } = await ctx.params;
  await removeMember({ weddingId: membership.weddingId, userId: user.id }, id);
  return noContent();
});
