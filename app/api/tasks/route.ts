import { requireMember } from "@/lib/access";
import { handler, json, parseBody, parseQuery } from "@/lib/api";
import { createTaskSchema, listTasksQuery } from "@/modules/tasks/schema";
import { createTask, listTasks } from "@/modules/tasks/service";

export const GET = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  const query = parseQuery(req, listTasksQuery);
  return json(
    await listTasks(membership.weddingId, { userId: user.id, role: membership.role }, query),
  );
});

export const POST = handler(async (req) => {
  const { user, membership } = await requireMember(req);
  const input = await parseBody(req, createTaskSchema);
  const task = await createTask(
    membership.weddingId,
    { userId: user.id, role: membership.role },
    input,
  );
  return json({ task }, 201);
});
