import "server-only";
import { type InferSchemaType, type Model, model, models, Schema } from "mongoose";

// tasks. See "Tasks, QR codes and photos" in docs/database-design.md.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const taskSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, ref: "Wedding", required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
    // Must have an active membership in this wedding when set. If they leave, the task stays
    // and shows them as removed until someone reassigns it.
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // YYYY-MM-DD. "Overdue" is never stored (see modules/tasks/overdue.ts).
    dueDate: { type: String, required: true, match: DATE_PATTERN },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    // "todo" sorts after "done" as text, so a descending sort puts open tasks first.
    status: { type: String, enum: ["todo", "done"], required: true, default: "todo" },
    note: { type: String, trim: true, maxlength: 1000 },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "tasks" },
);
taskSchema.index({ weddingId: 1, status: 1, dueDate: 1 });
taskSchema.index({ weddingId: 1, assigneeId: 1, status: 1 });

export type TaskAttrs = InferSchemaType<typeof taskSchema>;

export const Task = (models.Task as Model<TaskAttrs>) ?? model<TaskAttrs>("Task", taskSchema);
