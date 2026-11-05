import "server-only";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { ApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { User } from "@/modules/auth/model";
import { Event } from "@/modules/events/model";
import { Membership } from "@/modules/members/model";
import { taskOverdue } from "./overdue";
import { Task, type TaskAttrs } from "./model";
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from "./schema";
import type { TaskCounts, TaskItem, TaskList } from "./types";

// Every function takes weddingId first and filters by it, so one wedding can never reach
// another's tasks. A missing id and another wedding's id both answer 404.

export type Actor = { userId: string; role: "admin" | "manager" };

export type TaskView = TaskItem;

type TaskDoc = TaskAttrs & { _id: Types.ObjectId };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fills in names, the linked event and the overdue flag for a batch of tasks. */
async function toViews(wid: Types.ObjectId, docs: TaskDoc[], today: string): Promise<TaskView[]> {
  if (docs.length === 0) return [];
  const userIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const t of docs) {
    userIds.add(String(t.assigneeId));
    userIds.add(String(t.createdBy));
    if (t.completedBy) userIds.add(String(t.completedBy));
    if (t.eventId) eventIds.add(String(t.eventId));
  }
  const assigneeIds = [...new Set(docs.map((t) => String(t.assigneeId)))];

  const [users, active, events] = await Promise.all([
    User.find({ _id: { $in: [...userIds] } })
      .select("name")
      .lean(),
    Membership.find({ weddingId: wid, userId: { $in: assigneeIds }, status: "active" })
      .select("userId")
      .lean(),
    eventIds.size
      ? Event.find({ weddingId: wid, _id: { $in: [...eventIds] } })
          .select("name")
          .lean()
      : [],
  ]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const activeIds = new Set(active.map((m) => String(m.userId)));
  const eventNames = new Map(events.map((e) => [String(e._id), e.name]));
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    name: names.get(String(id)) ?? "Unknown",
  });

  return docs.map((t) => {
    const assignee = person(t.assigneeId);
    return {
      id: String(t._id),
      title: t.title,
      assignee: {
        ...assignee,
        initial: assignee.name.trim()[0]?.toUpperCase() ?? "?",
        // Removed or departed: no active membership in this wedding any more.
        removed: !activeIds.has(assignee.id),
      },
      dueDate: t.dueDate,
      ...(t.eventId ? { eventId: String(t.eventId) } : {}),
      ...(t.eventId && eventNames.has(String(t.eventId))
        ? { eventName: eventNames.get(String(t.eventId)) }
        : {}),
      status: t.status,
      ...taskOverdue(t, today),
      ...(t.note ? { note: t.note } : {}),
      ...(t.completedAt ? { completedAt: t.completedAt.toISOString() } : {}),
      ...(t.completedBy ? { completedBy: person(t.completedBy) } : {}),
      createdBy: person(t.createdBy),
    };
  });
}

const zero: TaskCounts = { total: 0, todo: 0, done: 0, overdue: 0 };

/** Counts for the whole wedding and for one member, whatever filters the list used. */
async function countTasks(
  wid: Types.ObjectId,
  userId: Types.ObjectId,
  today: string,
): Promise<{ summary: TaskCounts; mine: TaskCounts }> {
  const sum = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });
  const isDone = { $eq: ["$status", "done"] };
  const isOverdue = { $and: [{ $eq: ["$status", "todo"] }, { $lt: ["$dueDate", today] }] };
  const isMine = { $eq: ["$assigneeId", userId] };
  const [row] = await Task.aggregate<{
    total: number;
    done: number;
    overdue: number;
    mineTotal: number;
    mineDone: number;
    mineOverdue: number;
  }>([
    { $match: { weddingId: wid } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        done: sum(isDone),
        overdue: sum(isOverdue),
        mineTotal: sum(isMine),
        mineDone: sum({ $and: [isMine, isDone] }),
        mineOverdue: sum({ $and: [isMine, isOverdue] }),
      },
    },
  ]);
  if (!row) return { summary: { ...zero }, mine: { ...zero } };
  return {
    summary: { total: row.total, todo: row.total - row.done, done: row.done, overdue: row.overdue },
    mine: {
      total: row.mineTotal,
      todo: row.mineTotal - row.mineDone,
      done: row.mineDone,
      overdue: row.mineOverdue,
    },
  };
}

/**
 * The wedding's tasks (filtered), plus counts that ignore the filters. `limit` caps the list
 * only: the counts still cover every task.
 */
export async function listTasks(
  weddingId: string,
  actor: Actor,
  query: ListTasksQuery,
  limit?: number,
): Promise<TaskList> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const me = toObjectId(actor.userId);
  const today = todayIST();

  const conditions: Record<string, unknown>[] = [];
  if (query.view === "mine") conditions.push({ assigneeId: me });
  if (query.view === "overdue") conditions.push({ status: "todo", dueDate: { $lt: today } });
  if (query.status) conditions.push({ status: query.status });
  if (query.eventId) conditions.push({ eventId: toObjectId(query.eventId) });
  if (query.assigneeId) conditions.push({ assigneeId: toObjectId(query.assigneeId) });
  if (query.q) conditions.push({ title: new RegExp(escapeRegex(query.q), "i") });

  // Open tasks first ("todo" sorts after "done" as text, so the sort is descending), then by
  // due date. Overdue tasks have the earliest dates, so they come first; Done tasks come last.
  const docs = await Task.find({
    weddingId: wid,
    ...(conditions.length ? { $and: conditions } : {}),
  })
    .sort({ status: -1, dueDate: 1, _id: 1 })
    .limit(limit ?? 0)
    .lean();

  const [items, counts] = await Promise.all([
    toViews(wid, docs, today),
    countTasks(wid, me, today),
  ]);
  return { items, ...counts };
}

async function findTask(wid: Types.ObjectId, id: string) {
  const task = await Task.findOne({ _id: toObjectId(id), weddingId: wid }).lean();
  if (!task) throw new ApiError("NOT_FOUND");
  return task;
}

async function viewOf(wid: Types.ObjectId, task: TaskDoc): Promise<TaskView> {
  const [view] = await toViews(wid, [task], todayIST());
  return view!;
}

/** The assignee must be an active member of this wedding. */
async function assertActiveAssignee(wid: Types.ObjectId, assigneeId: string) {
  const active = await Membership.exists({
    weddingId: wid,
    userId: toObjectId(assigneeId),
    status: "active",
  });
  if (!active) {
    throw new ApiError("ASSIGNEE_NOT_MEMBER", undefined, {
      fields: { assigneeId: "Choose someone who is part of this wedding." },
    });
  }
}

/** A linked event must belong to this wedding. Unknown and other weddings' ids answer alike. */
async function assertEventInWedding(wid: Types.ObjectId, eventId: string) {
  if (!(await Event.exists({ _id: toObjectId(eventId), weddingId: wid }))) {
    throw new ApiError("VALIDATION_FAILED", undefined, {
      fields: { eventId: "Choose an event from this wedding." },
    });
  }
}

/**
 * The event can be deleted between the check and the write, and its clean-up would then have
 * missed this task. Look once more and drop the link if the event is gone. (An assignee who
 * leaves in that gap needs nothing: tasks of removed members are kept and flagged on purpose.)
 */
async function dropDeletedEvent(wid: Types.ObjectId, task: TaskDoc): Promise<TaskDoc> {
  if (!task.eventId || (await Event.exists({ _id: task.eventId, weddingId: wid }))) return task;
  const cleared = await Task.findOneAndUpdate(
    { _id: task._id, weddingId: wid, eventId: task.eventId },
    { $unset: { eventId: 1 } },
    { returnDocument: "after" },
  ).lean();
  return cleared ?? task;
}

export async function getTask(weddingId: string, id: string): Promise<TaskView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  return viewOf(wid, await findTask(wid, id));
}

export async function createTask(
  weddingId: string,
  actor: Actor,
  input: CreateTaskInput,
): Promise<TaskView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  await assertActiveAssignee(wid, input.assigneeId);
  if (input.eventId) await assertEventInWedding(wid, input.eventId);
  const task = await Task.create({
    ...input,
    weddingId: wid,
    assigneeId: toObjectId(input.assigneeId),
    eventId: input.eventId ? toObjectId(input.eventId) : undefined,
    createdBy: toObjectId(actor.userId),
  });
  return viewOf(wid, await dropDeletedEvent(wid, task.toObject()));
}

export async function updateTask(
  weddingId: string,
  id: string,
  input: UpdateTaskInput,
): Promise<TaskView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const taskId = (await findTask(wid, id))._id;
  if (input.assigneeId !== undefined) await assertActiveAssignee(wid, input.assigneeId);
  if (input.eventId) await assertEventInWedding(wid, input.eventId);

  // null clears an optional field.
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null) unset[key] = 1;
    else if (value !== undefined) set[key] = value;
  }
  const task = await Task.findOneAndUpdate(
    { _id: taskId, weddingId: wid },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!task) throw new ApiError("NOT_FOUND");
  return viewOf(wid, await dropDeletedEvent(wid, task));
}

export async function deleteTask(weddingId: string, id: string): Promise<void> {
  await connectDb();
  const result = await Task.deleteOne({ _id: toObjectId(id), weddingId: toObjectId(weddingId) });
  if (result.deletedCount === 0) throw new ApiError("NOT_FOUND");
}

/** Only the assignee or an Admin may change a task's status. */
function assertMayChangeStatus(task: TaskDoc, actor: Actor) {
  if (actor.role !== "admin" && String(task.assigneeId) !== actor.userId) {
    throw new ApiError("NOT_ASSIGNEE");
  }
}

export async function markDone(weddingId: string, actor: Actor, id: string): Promise<TaskView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const found = await findTask(wid, id);
  assertMayChangeStatus(found, actor);
  // Only an open task is changed, so two requests at once can't both record who finished it.
  const updated = await Task.findOneAndUpdate(
    { _id: found._id, weddingId: wid, status: "todo" },
    { $set: { status: "done", completedAt: new Date(), completedBy: toObjectId(actor.userId) } },
    { returnDocument: "after" },
  ).lean();
  return viewOf(wid, updated ?? (await findTask(wid, id)));
}

export async function reopenTask(weddingId: string, actor: Actor, id: string): Promise<TaskView> {
  await connectDb();
  const wid = toObjectId(weddingId);
  const found = await findTask(wid, id);
  assertMayChangeStatus(found, actor);
  const updated = await Task.findOneAndUpdate(
    { _id: found._id, weddingId: wid, status: "done" },
    { $set: { status: "todo" }, $unset: { completedAt: 1, completedBy: 1 } },
    { returnDocument: "after" },
  ).lean();
  return viewOf(wid, updated ?? (await findTask(wid, id)));
}
