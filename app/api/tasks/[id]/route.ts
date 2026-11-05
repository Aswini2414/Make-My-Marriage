import { requireMember } from "@/lib/access";
import { handler, json, noContent, parseBody } from "@/lib/api";
import { updateTaskSchema } from "@/modules/tasks/schema";
import { deleteTask, getTask, updateTask } from "@/modules/tasks/service";

export const GET = handler(async (req, ctx: RouteContext<"/api/tasks/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  return json({ task: await getTask(membership.weddingId, id) });
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/tasks/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  const input = await parseBody(req, updateTaskSchema);
  return json({ task: await updateTask(membership.weddingId, id, input) });
});

export const DELETE = handler(async (req, ctx: RouteContext<"/api/tasks/[id]">) => {
  const { membership } = await requireMember(req);
  const { id } = await ctx.params;
  await deleteTask(membership.weddingId, id);
  return noContent();
});
